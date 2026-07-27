import {
  execOnMachine,
  getMachineFile,
  putMachineFile,
} from "@/server/machines/store";
import type { Machine } from "@/server/machines/authz";
import {
  generateWithTools,
  type ToolCall,
  type ToolDef,
  type Turn,
} from "@/server/model/gateway";

/**
 * The chat agent for a space: a model with read/write/exec bound to one
 * machine, so a prompt in a thread can actually change files on that VM.
 *
 * Everything it can do to the machine is in this file. That is deliberate —
 * these tools run real commands as root on a real box, so the blast radius
 * should be readable in one sitting rather than assembled from a plugin
 * registry.
 */

/** Stop runaway loops: a wrong turn costs machine time and model spend. */
const MAX_STEPS = 12;

/** Exec output is fed back to the model, so it must be bounded. */
const MAX_TOOL_OUTPUT = 16_000;

/** A written file is sent as a string; refuse anything unreasonable. */
const MAX_WRITE_BYTES = 512 * 1024;

export type AgentStep = {
  tool: string;
  summary: string;
  ok: boolean;
};

export type AgentResult = {
  text: string;
  steps: AgentStep[];
  /** True when it ran out of steps rather than finishing. */
  truncated: boolean;
};

const TOOLS: ToolDef[] = [
  {
    name: "list_files",
    description:
      "List files in the space, relative to /workspace. Use before reading or writing so you act on paths that exist.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory relative to /workspace. Defaults to the root.",
        },
      },
    },
  },
  {
    name: "read_file",
    description: "Read a UTF-8 file from the space, relative to /workspace.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write a file in the space, relative to /workspace, creating or replacing it. Send the file's complete new contents — this is not a patch.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command in the space as root, from /workspace. Use it to install, build, test, or inspect. Background long-running servers (e.g. `nohup … &`) so this returns.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];

function systemPrompt(machine: Machine): string {
  return [
    `You are the Atlas agent working inside the space "${machine.slug}".`,
    "",
    "It is a Debian 12 VM. You are root, the working directory is /workspace,",
    "and node, npm, pnpm, python3, git, curl, gcc and make are installed.",
    "Ports 3000 and 8000 are the only ones reachable from outside, so any server",
    "you start must listen on 0.0.0.0 and use one of those.",
    "",
    "Use the tools to actually make the change the user asked for — do not",
    "describe edits you have not made. Read a file before you rewrite it, and",
    "send the whole file when you write.",
    "",
    "When you are done, reply with a short plain summary of what you changed.",
    "If you could not do it, say what blocked you. Never claim a change you did",
    "not make.",
  ].join("\n");
}

function clip(text: string): string {
  return text.length <= MAX_TOOL_OUTPUT
    ? text
    : `${text.slice(0, MAX_TOOL_OUTPUT)}\n… truncated`;
}

/** Run one tool call against the machine. Errors become model-visible text. */
async function runTool(
  machine: Machine,
  call: ToolCall,
  actor: { userId: string },
): Promise<{ output: string; step: AgentStep }> {
  // Tool arguments are untyped JSON from the model — coerce, never String().
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  const fail = (tool: string, message: string) => ({
    output: `Error: ${message}`,
    step: { tool, summary: message, ok: false },
  });

  try {
    switch (call.name) {
      case "list_files": {
        const dir = typeof call.input.path === "string" ? call.input.path : ".";
        const res = await execOnMachine(
          machine,
          // -A hides . and .. but still shows dotfiles, which matter here.
          { cmd: `ls -A1 ${JSON.stringify(dir)}` },
          actor,
        );
        return {
          output: clip(res.exitCode === 0 ? res.stdout : res.stderr),
          step: {
            tool: "list_files",
            summary: `Listed ${dir}`,
            ok: res.exitCode === 0,
          },
        };
      }

      case "read_file": {
        const path = str(call.input.path);
        if (!path) return fail("read_file", "path is required");
        const bytes = await getMachineFile(machine, path);
        if (!bytes) return fail("read_file", `${path} does not exist`);
        return {
          output: clip(Buffer.from(bytes).toString("utf8")),
          step: { tool: "read_file", summary: `Read ${path}`, ok: true },
        };
      }

      case "write_file": {
        const path = str(call.input.path);
        const content = str(call.input.content);
        if (!path) return fail("write_file", "path is required");
        const body = Buffer.from(content, "utf8");
        if (body.byteLength > MAX_WRITE_BYTES) {
          return fail("write_file", `${path} is over 512KB — write it in pieces`);
        }
        await putMachineFile(machine, path, new Uint8Array(body));
        return {
          output: `Wrote ${path} (${body.byteLength} bytes).`,
          step: {
            tool: "write_file",
            summary: `Wrote ${path}`,
            ok: true,
          },
        };
      }

      case "run_command": {
        const cmd = str(call.input.command);
        if (!cmd) return fail("run_command", "command is required");
        const res = await execOnMachine(machine, { cmd }, actor);
        const body = [
          `exit ${res.exitCode}`,
          res.stdout ? `stdout:\n${res.stdout}` : "",
          res.stderr ? `stderr:\n${res.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return {
          output: clip(body),
          step: {
            tool: "run_command",
            summary: cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd,
            ok: res.exitCode === 0,
          },
        };
      }

      default:
        return fail(call.name, `unknown tool ${call.name}`);
    }
  } catch (err) {
    // A driver failure is information the model can act on, not a crash.
    return fail(call.name, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Answer a prompt against a space, using tools to make real changes.
 *
 * `history` is prior thread text, oldest first, so a follow-up like "now also
 * update the README" has the context it needs.
 */
export async function runSpaceAgent(input: {
  machine: Machine;
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
  userId: string;
}): Promise<AgentResult> {
  const { machine, prompt, userId } = input;

  const messages: Turn[] = [
    ...(input.history ?? []).map<Turn>((m) =>
      m.role === "user"
        ? { role: "user", content: m.content }
        : { role: "assistant", content: [{ type: "text", text: m.content }] },
    ),
    { role: "user", content: prompt },
  ];

  const steps: AgentStep[] = [];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await generateWithTools({
      system: systemPrompt(machine),
      messages,
      tools: TOOLS,
    });
    if (turn.text) text = turn.text;

    if (turn.calls.length === 0) {
      return { text: text || "Done.", steps, truncated: false };
    }

    messages.push({ role: "assistant", content: turn.raw });

    const results = [];
    for (const call of turn.calls) {
      const { output, step: s } = await runTool(machine, call, { userId });
      steps.push(s);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: output,
        is_error: !s.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  return {
    text:
      (text ? `${text}\n\n` : "") +
      `Stopped after ${MAX_STEPS} steps without finishing. Ask me to continue if that looks incomplete.`,
    steps,
    truncated: true,
  };
}

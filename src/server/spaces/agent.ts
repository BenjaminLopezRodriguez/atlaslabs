import { execOnMachine, getMachineFile } from "@/server/machines/store";
import type { Machine } from "@/server/machines/authz";
import {
  generateWithTools,
  type ToolCall,
  type ToolDef,
  type Turn,
} from "@/server/model/gateway";
import type { RunKind } from "@/server/build/context-pack";
import { proposeEdit, type ProposedEdit } from "@/server/spaces/edits";
import { shellQuote } from "@/server/shell";
import { ensureIndex, searchSpace } from "@/server/spaces/space-index";

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

/**
 * A turn is one blocking call that can run for minutes, so the work has to
 * report itself as it goes or the chat looks dead. Emitted at stage
 * boundaries and after every tool call; the caller decides where it lands.
 */
export type Progress = {
  phase: string;
  detail?: string;
  /**
   * Milliseconds from the start of the turn to when this phase began.
   *
   * A stamp rather than a duration: the phase in flight has not finished, so
   * its cost is `now - elapsedMs`, and every finished phase's cost is the gap
   * to the next stamp. One number, no bookkeeping, and the turn's timeline
   * survives in the message row for whoever asks why it took a minute.
   */
  elapsedMs?: number;
};

export type OnProgress = (p: Progress) => void | Promise<void>;

export type PlanStep = {
  title: string;
  status: "pending" | "done";
};

export type AgentResult = {
  text: string;
  steps: AgentStep[];
  /** The checklist the agent committed to, in order. Empty when it never made one. */
  plan: PlanStep[];
  /** File writes awaiting a human decision. */
  edits: ProposedEdit[];
  /** True when it ran out of steps rather than finishing. */
  truncated: boolean;
};

/** Per-run mutable state the tools read and write. */
type AgentContext = {
  machine: Machine;
  threadId: string | null;
  userId: string;
  plan: PlanStep[];
  edits: ProposedEdit[];
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
          description:
            "Directory relative to /workspace. Defaults to the root.",
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
    name: "set_plan",
    description:
      "Record the steps you intend to take, before you start. Call this first for anything that takes more than one edit. Keep steps short and in order; call it again to replace the plan if the work changes shape.",
    input_schema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Ordered step titles, at most 8.",
        },
      },
      required: ["steps"],
    },
  },
  {
    name: "complete_step",
    description:
      "Mark a plan step finished, by its 1-based number. Call it as you go so the person watching sees progress.",
    input_schema: {
      type: "object",
      properties: { step: { type: "number" } },
      required: ["step"],
    },
  },
  {
    name: "search_code",
    description:
      "Search the space's files for a literal string. Use this to find where something lives instead of listing directories one by one.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to find." },
        glob: {
          type: "string",
          description: 'Optional filename filter, e.g. "*.ts".',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "write_file",
    description:
      "Propose a file in the space, relative to /workspace. The write does NOT happen immediately — it is shown to the user as a diff and applied only if they accept it. Send the file's complete new contents; this is not a patch.",
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

/** Bound so a large tree cannot crowd the conversation out of the context window. */
const MAX_INDEXED_FILES_IN_PROMPT = 400;

/**
 * Per-stage discipline, ported from manycat's `prompts/sections.py`.
 *
 * The distinction that earns its keep is oneshot vs modify: the same model,
 * given the same repo, will either build the thing or rebuild the project from
 * scratch depending only on which of these paragraphs it was shown.
 */
const RUN_KIND_SECTION: Record<RunKind, string> = {
  oneshot: [
    "RUN KIND: ONESHOT — this space is empty and you are creating the project.",
    "Write the complete working app, not a placeholder or a TODO skeleton.",
    "Start from the main page or entrypoint and make it real on the first pass.",
  ].join("\n"),
  modify: [
    "RUN KIND: MODIFY — this space already holds a project.",
    "Apply the smallest change that satisfies the ask. Read a file before you",
    "rewrite it, keep its existing style, and leave unrelated code alone.",
    "Never replace the project with a fresh scaffold, and never rewrite a file",
    "you have not read this run.",
  ].join("\n"),
  understand: [
    "RUN KIND: UNDERSTAND — read only. Do not write files or change anything.",
  ].join("\n"),
};

function systemPrompt(
  machine: Machine,
  files: string[] | null,
  opts: { runKind?: RunKind; contract?: string } = {},
): string {
  const listing = files?.length
    ? [
        "",
        "Files in this space:",
        files.slice(0, MAX_INDEXED_FILES_IN_PROMPT).join("\n"),
        files.length > MAX_INDEXED_FILES_IN_PROMPT
          ? `… and ${files.length - MAX_INDEXED_FILES_IN_PROMPT} more — use search_code to find the rest.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return [
    `You are the Atlas agent working inside the space "${machine.slug}".`,
    "",
    opts.runKind ? RUN_KIND_SECTION[opts.runKind] : "",
    opts.runKind ? "" : null,
    opts.contract ? `Build contract — this is the ask:\n${opts.contract}` : "",
    opts.contract ? "" : null,
    "It is a Debian 12 VM. You are root, the working directory is /workspace,",
    "and node, npm, pnpm, python3, git, curl, gcc and make are installed.",
    "Ports 3000 and 8000 are the only ones reachable from outside, so any server",
    "you start must listen on 0.0.0.0 and use one of those.",
    "",
    "Every space is scaffolded with a Dockerfile, docker-compose.yml and",
    "railway.json that serve it on port 3000. Prefer changing those files over",
    "inventing new deploy config.",
    "",
    "Work like this:",
    "1. If the task needs more than one edit, call set_plan first.",
    "2. Find the relevant files with search_code before reading or writing.",
    "3. Read a file before you rewrite it, and send the whole file when you write.",
    "4. Call complete_step as each step lands.",
    "",
    "write_file proposes a change for the user to accept — it does not take",
    "effect on its own. Say what you proposed, not what you changed, and do not",
    "run commands that depend on a proposed edit already being on disk.",
    "",
    "When you are done, reply with a short plain summary. If you could not do",
    "it, say what blocked you. Never claim a change you did not make.",
    listing,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function clip(text: string): string {
  return text.length <= MAX_TOOL_OUTPUT
    ? text
    : `${text.slice(0, MAX_TOOL_OUTPUT)}\n… truncated`;
}

/** Run one tool call against the machine. Errors become model-visible text. */
async function runTool(
  ctx: AgentContext,
  call: ToolCall,
): Promise<{ output: string; step: AgentStep }> {
  const machine = ctx.machine;
  const actor = { userId: ctx.userId };

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
          { cmd: `ls -A1 ${shellQuote(dir)}` },
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
          return fail(
            "write_file",
            `${path} is over 512KB — write it in pieces`,
          );
        }
        const edit = await proposeEdit({
          machine,
          threadId: ctx.threadId,
          path,
          after: content,
          userId: ctx.userId,
        });
        ctx.edits.push(edit);
        return {
          output: `Proposed a change to ${path} (${body.byteLength} bytes). It is waiting for the user to accept — the file on disk is unchanged.`,
          step: {
            tool: "write_file",
            summary: `Proposed ${path}`,
            ok: true,
          },
        };
      }

      case "set_plan": {
        const raw = Array.isArray(call.input.steps) ? call.input.steps : [];
        const titles = raw
          .filter((s): s is string => typeof s === "string" && s.trim() !== "")
          .slice(0, 8)
          .map((s) => s.trim().slice(0, 160));
        if (!titles.length) return fail("set_plan", "steps is required");
        // Replace wholesale: a re-plan mid-run means the old list is wrong.
        ctx.plan = titles.map((title) => ({ title, status: "pending" }));
        return {
          output: `Plan set:\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
          step: {
            tool: "set_plan",
            summary: `Planned ${titles.length} steps`,
            ok: true,
          },
        };
      }

      case "complete_step": {
        const n = typeof call.input.step === "number" ? call.input.step : NaN;
        const target = ctx.plan[n - 1];
        if (!target)
          return fail("complete_step", `there is no step ${String(n)}`);
        target.status = "done";
        return {
          output: `Step ${n} marked done.`,
          step: { tool: "complete_step", summary: target.title, ok: true },
        };
      }

      case "search_code": {
        const query = str(call.input.query);
        if (!query) return fail("search_code", "query is required");
        const glob = str(call.input.glob) || null;
        const output = await searchSpace({
          machine,
          userId: ctx.userId,
          query,
          glob,
        });
        return {
          output: clip(output),
          step: {
            tool: "search_code",
            summary: `Searched for "${query}"`,
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
  threadId?: string | null;
  /** Build stage. Omitted, the agent behaves as it always has. */
  runKind?: RunKind;
  /** The contract from the spec stage — the ask, expanded. */
  contract?: string;
  /** Research or codebase context, prepended to the first user turn. */
  context?: string;
  /** Called after every tool call so a caller can surface live progress. */
  onProgress?: OnProgress;
  /**
   * Called as the model writes, with the whole reply text so far — a
   * replacement, not a fragment. The loop keeps only the final step's prose
   * (see `text` below), so emitting cumulative text per step is what keeps a
   * streamed reply identical to the one that eventually gets saved.
   */
  onReplyText?: (text: string) => void;
}): Promise<AgentResult> {
  const { machine, prompt, userId } = input;

  const ctx: AgentContext = {
    machine,
    threadId: input.threadId ?? null,
    userId,
    plan: [],
    edits: [],
  };
  const index = await ensureIndex(machine, userId);

  const messages: Turn[] = [
    ...(input.history ?? []).map<Turn>((m) =>
      m.role === "user"
        ? { role: "user", content: m.content }
        : { role: "assistant", content: [{ type: "text", text: m.content }] },
    ),
    {
      role: "user",
      // Context leads the turn rather than the system prompt so it stays with
      // the ask it belongs to across a multi-turn thread.
      content: input.context ? `${input.context}\n\n---\n\n${prompt}` : prompt,
    },
  ];

  const steps: AgentStep[] = [];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    // Reset per step: this step's prose replaces the last step's, matching how
    // `text` below is assigned rather than appended.
    let stepText = "";
    const turn = await generateWithTools({
      system: systemPrompt(machine, index?.files ?? null, {
        runKind: input.runKind,
        contract: input.contract,
      }),
      messages,
      tools: TOOLS,
      onDelta: input.onReplyText
        ? (chunk) => {
            stepText += chunk;
            input.onReplyText!(stepText);
          }
        : undefined,
    });
    if (turn.text) text = turn.text;

    if (turn.calls.length === 0) {
      return {
        text: text || "Done.",
        steps,
        plan: ctx.plan,
        edits: ctx.edits,
        truncated: false,
      };
    }

    messages.push({ role: "assistant", content: turn.raw });

    const results = [];
    for (const call of turn.calls) {
      const { output, step: s } = await runTool(ctx, call);
      steps.push(s);
      await input.onProgress?.({ phase: s.tool, detail: s.summary });
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
    plan: ctx.plan,
    edits: ctx.edits,
    truncated: true,
  };
}

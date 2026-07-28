/** Prose/review: one shot, no tools. */
const TEXT_MODEL = "claude-sonnet-5";
/** Code generation: the tool-use loop that edits files in a space. */
const CODE_MODEL = "deepseek-v4-flash";
/** Used for the tool loop when DEEPSEEK_API_KEY is unset. */
const CODE_MODEL_FALLBACK = "claude-opus-5";

type CodeProvider =
  | { provider: "deepseek"; key: string; model: string }
  | { provider: "anthropic"; key: string; model: string }
  | null;

/**
 * Which provider runs the coding agent. DeepSeek V4 Flash is the default; a
 * deployment that only has an Anthropic key keeps working on Opus rather than
 * silently dropping to the stub.
 */
function codeProvider(): CodeProvider {
  const deepseek = process.env.DEEPSEEK_API_KEY;
  if (deepseek) return { provider: "deepseek", key: deepseek, model: CODE_MODEL };
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic)
    return { provider: "anthropic", key: anthropic, model: CODE_MODEL_FALLBACK };
  return null;
}

export type GenerateInput = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

export type GenerateResult = {
  text: string;
  model: string;
  stub: boolean;
};

/**
 * Model gateway — the only place Atlas talks to a model provider.
 * Falls back to a deterministic stub when no provider key is configured so
 * the whole product loop stays testable offline.
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = TEXT_MODEL;
  if (!key) {
    return {
      model: "stub",
      stub: true,
      text: stubResponse(input),
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`model gateway: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const text = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  return { text, model, stub: false };
}

/* ------------------------------- tool use ------------------------------- */

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  input_schema: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: unknown[] }
  | { role: "user"; content: unknown[] };

export type ToolTurnResult = {
  /** Prose the model emitted this turn. May be empty while it is calling tools. */
  text: string;
  calls: ToolCall[];
  /** Raw assistant content blocks, to be echoed back as history next turn. */
  raw: unknown[];
  stopReason: string;
  model: string;
  stub: boolean;
};

/**
 * Called with each text fragment as the model emits it, so a caller can show
 * a reply being written instead of a spinner. Never called for tool-call
 * arguments — those are bookkeeping, not something a reader wants streamed.
 */
export type OnDelta = (chunk: string) => void;

export type ToolTurnInput = {
  system: string;
  messages: Turn[];
  tools: ToolDef[];
  maxTokens?: number;
  onDelta?: OnDelta;
};

/**
 * One turn of a tool-use conversation, streamed.
 *
 * The caller owns the loop: it runs the returned tool calls, appends their
 * results, and calls this again. Keeping the loop outside means the tool
 * implementations — which touch a real VM — stay in one auditable place
 * instead of being hidden behind a generic agent abstraction.
 *
 * Both providers stream unconditionally. `onDelta` only decides whether anyone
 * is listening to the text as it arrives; the assembled result is identical
 * either way, so there is no second non-streaming path to keep in step.
 */
export async function generateWithTools(
  input: ToolTurnInput,
): Promise<ToolTurnResult> {
  const chosen = codeProvider();
  if (!chosen) {
    return {
      text: "[stub model — set DEEPSEEK_API_KEY for real inference] No changes were made.",
      calls: [],
      raw: [],
      stopReason: "end_turn",
      model: "stub",
      stub: true,
    };
  }
  return chosen.provider === "deepseek"
    ? deepseekWithTools(chosen.key, chosen.model, input)
    : anthropicWithTools(chosen.key, chosen.model, input);
}

/* --------------------------------- SSE ---------------------------------- */

/**
 * Yields the payload of every `data:` field in an SSE response.
 *
 * Frames are split on a blank line rather than per-chunk, because a network
 * read can land mid-frame — parsing what has arrived so far is how streams
 * corrupt themselves.
 */
async function* sseData(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (!body) throw new Error("model gateway: streaming response had no body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  }
}

/** Accumulates streamed tool-call fragments, keyed by their position. */
type PartialCall = { id: string; name: string; args: string };

function assembleCalls(partial: Map<number, PartialCall>): ToolCall[] {
  return [...partial.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => ({ id: c.id, name: c.name, input: parseArgs(c.args) }));
}

/** Anthropic content blocks, rebuilt so the agent loop can echo `raw` back. */
function toBlocks(text: string, calls: ToolCall[]): Block[] {
  return [
    ...(text ? [{ type: "text", text }] : []),
    ...calls.map((c) => ({
      type: "tool_use",
      id: c.id,
      name: c.name,
      input: c.input,
    })),
  ];
}

/* ------------------------------- anthropic ------------------------------ */

async function anthropicWithTools(
  key: string,
  model: string,
  input: ToolTurnInput,
): Promise<ToolTurnResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // Opus 5 thinks by default and max_tokens caps thinking + output together,
      // so this is deliberately roomier than a no-thinking budget would need.
      max_tokens: input.maxTokens ?? 16000,
      output_config: { effort: "xhigh" },
      system: input.system,
      tools: input.tools,
      messages: input.messages,
      stream: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`model gateway: ${res.status} ${await res.text()}`);
  }

  let text = "";
  let stopReason = "end_turn";
  const partial = new Map<number, PartialCall>();
  // Every content block by index, so `raw` can be replayed in original order.
  const blocks = new Map<number, Block>();

  for await (const data of sseData(res)) {
    const event = JSON.parse(data) as {
      type: string;
      index?: number;
      content_block?: { type: string; id?: string; name?: string };
      delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        signature?: string;
        partial_json?: string;
        stop_reason?: string;
      };
      error?: { message?: string };
    };
    const at = event.index ?? 0;
    switch (event.type) {
      case "content_block_start": {
        const block = event.content_block;
        if (!block) break;
        if (block.type === "tool_use") {
          partial.set(at, {
            id: block.id ?? "",
            name: block.name ?? "",
            args: "",
          });
        }
        blocks.set(at, { type: block.type, ...(block.type === "text" ? { text: "" } : {}) });
        break;
      }
      case "content_block_delta": {
        const block = blocks.get(at);
        if (event.delta?.type === "text_delta" && event.delta.text) {
          text += event.delta.text;
          if (block) block.text = (block.text ?? "") + event.delta.text;
          input.onDelta?.(event.delta.text);
        } else if (event.delta?.type === "input_json_delta") {
          const cur = partial.get(at);
          if (cur) cur.args += event.delta.partial_json ?? "";
        } else if (event.delta?.type === "thinking_delta") {
          if (block) block.thinking = (block.thinking ?? "") + (event.delta.thinking ?? "");
        } else if (event.delta?.type === "signature_delta") {
          if (block) block.signature = event.delta.signature;
        }
        break;
      }
      case "message_delta":
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        break;
      // An error mid-stream arrives as an event, not a bad status code.
      case "error":
        throw new Error(
          `model gateway: ${event.error?.message ?? "stream error"}`,
        );
    }
  }

  const calls = assembleCalls(partial);
  /*
   * Rebuild every block in its original order, thinking included. Opus thinks
   * by default, and Anthropic rejects a tool-use turn whose history dropped
   * the thinking blocks — so `raw` cannot be reduced to just text and calls.
   */
  const raw = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, b]) => {
      if (b.type !== "tool_use") return b;
      const call = partial.get(index);
      return call
        ? { type: "tool_use", id: call.id, name: call.name, input: parseArgs(call.args) }
        : b;
    });

  return { text, calls, raw, stopReason, model, stub: false };
}

/* ------------------------------- deepseek ------------------------------- */

/*
 * DeepSeek speaks the OpenAI chat-completions shape, Atlas speaks Anthropic's
 * content-block shape, and the agent loop echoes raw assistant blocks back as
 * history. Rather than teach that loop two dialects, the translation lives
 * here: blocks go out as OpenAI messages, the reply comes back as blocks.
 */

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

/** Anthropic content blocks, as the agent loop builds them. */
type Block = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  /** Extended thinking, which must survive a round trip through history. */
  thinking?: string;
  signature?: string;
};

function toOpenAiMessages(system: string, turns: Turn[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (typeof turn.content === "string") {
      out.push({ role: turn.role, content: turn.content });
      continue;
    }
    const blocks = turn.content as Block[];
    if (turn.role === "assistant") {
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      const calls = blocks
        .filter((b) => b.type === "tool_use")
        .map<OpenAiToolCall>((b) => ({
          id: b.id!,
          type: "function",
          function: { name: b.name!, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      continue;
    }
    // A user turn carrying tool_result blocks becomes one `tool` message each.
    for (const b of blocks) {
      if (b.type !== "tool_result") continue;
      out.push({
        role: "tool",
        tool_call_id: b.tool_use_id!,
        content: b.is_error ? `ERROR: ${b.content ?? ""}` : (b.content ?? ""),
      });
    }
  }
  return out;
}

async function deepseekWithTools(
  key: string,
  model: string,
  input: ToolTurnInput,
): Promise<ToolTurnResult> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 16000,
      messages: toOpenAiMessages(input.system, input.messages),
      tools: input.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      tool_choice: "auto",
      stream: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`model gateway: ${res.status} ${await res.text()}`);
  }

  let text = "";
  let finish = "stop";
  const partial = new Map<number, PartialCall>();

  for await (const data of sseData(res)) {
    if (data === "[DONE]") break;
    const chunk = JSON.parse(data) as {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        finish_reason?: string | null;
      }[];
    };
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      input.onDelta?.(delta.content);
    }
    // Tool calls arrive as fragments: the name in one chunk, the arguments
    // JSON split across many. `index` is what ties the pieces together.
    for (const tc of delta?.tool_calls ?? []) {
      const cur = partial.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name = tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      partial.set(tc.index, cur);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  }

  const calls = assembleCalls(partial);
  return {
    text,
    calls,
    raw: toBlocks(text, calls),
    stopReason: finish === "tool_calls" ? "tool_use" : "end_turn",
    model,
    stub: false,
  };
}

function parseArgs(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Deterministic offline output: structured review of provided context. */
function stubResponse(input: GenerateInput): string {
  const files = [...input.prompt.matchAll(/^### FILE: (.+)$/gm)].map(
    (m) => m[1],
  );
  const lines = [
    "[stub model — set ANTHROPIC_API_KEY for real inference]",
    "",
    "## Review",
    files.length
      ? `Reviewed ${files.length} file(s): ${files.slice(0, 10).join(", ")}${files.length > 10 ? ", …" : ""}.`
      : "No source files were attached to this run.",
    "",
    "### Findings",
    "- No blocking issues found by the stub reviewer.",
    "- Connect a model provider for substantive analysis.",
  ];
  return lines.join("\n");
}

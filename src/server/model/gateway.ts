/** Prose/review: one shot, no tools. */
const TEXT_MODEL = "claude-sonnet-5";
/** Code generation: the tool-use loop that edits files in a space. */
const CODE_MODEL = "claude-opus-5";

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
 * One turn of an Anthropic tool-use conversation.
 *
 * The caller owns the loop: it runs the returned tool calls, appends their
 * results, and calls this again. Keeping the loop outside means the tool
 * implementations — which touch a real VM — stay in one auditable place
 * instead of being hidden behind a generic agent abstraction.
 */
export async function generateWithTools(input: {
  system: string;
  messages: Turn[];
  tools: ToolDef[];
  maxTokens?: number;
}): Promise<ToolTurnResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = CODE_MODEL;
  if (!key) {
    return {
      text: "[stub model — set ANTHROPIC_API_KEY for real inference] No changes were made.",
      calls: [],
      raw: [],
      stopReason: "end_turn",
      model: "stub",
      stub: true,
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
      // Opus 5 thinks by default and max_tokens caps thinking + output together,
      // so this is deliberately roomier than a no-thinking budget would need.
      max_tokens: input.maxTokens ?? 16000,
      output_config: { effort: "xhigh" },
      system: input.system,
      tools: input.tools,
      messages: input.messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`model gateway: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    content: {
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }[];
    stop_reason: string;
  };

  return {
    text: json.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join(""),
    calls: json.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({ id: c.id!, name: c.name!, input: c.input ?? {} })),
    raw: json.content,
    stopReason: json.stop_reason,
    model,
    stub: false,
  };
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

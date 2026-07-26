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
  const model = "claude-sonnet-5";
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

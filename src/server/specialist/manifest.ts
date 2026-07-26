/**
 * Draft specialist manifest derived from a user prompt (spec §5/§6).
 * Deterministic today; a model call can replace `draftManifestFromPrompt`
 * without changing callers.
 */

export type SpecialistManifest = {
  name: string;
  purpose: string;
  baseModelPolicy: { provider: "anthropic"; model: string };
  sources: string[];
  memoryPolicy: { scope: "workspace"; promotion: "explicit" };
  tools: string[];
  executionLimits: { maxMinutes: number; maxConcurrentRuns: number };
  outputSchema: Record<string, unknown> | null;
  /** Open questions Atlas still needs answered (spec first-run step 5). */
  missing: string[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "our",
  "your",
  "my",
  "that",
  "this",
  "for",
  "of",
  "to",
  "in",
  "on",
  "with",
  "into",
  "from",
  "it",
  "them",
  "create",
  "build",
  "make",
  "specialist",
  "agent",
  "expert",
  "learn",
  "understands",
  "understand",
  "every",
  "against",
]);

function titleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 4);
  if (words.length === 0) return "New Specialist";
  const title = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  return `${title} Specialist`.slice(0, 80);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function draftManifestFromPrompt(prompt: string): SpecialistManifest {
  return {
    name: titleFromPrompt(prompt),
    purpose: prompt.trim(),
    baseModelPolicy: { provider: "anthropic", model: "claude-sonnet-5" },
    sources: [],
    memoryPolicy: { scope: "workspace", promotion: "explicit" },
    tools: [],
    executionLimits: { maxMinutes: 30, maxConcurrentRuns: 2 },
    outputSchema: null,
    missing: [
      "knowledge sources",
      "permitted tools",
      "expected output shape",
      "privacy and sharing scope",
    ],
  };
}

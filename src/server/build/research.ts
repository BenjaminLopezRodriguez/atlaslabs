import { randomUUID } from "node:crypto";

import { generate } from "@/server/model/gateway";

import {
  fallbackResearchPlan,
  type ResearchBrief,
  type ResearchChunk,
  type ResearchPlan,
} from "./plan";

/**
 * The context stage for greenfield builds: work out what is actually being
 * asked for before any code is written.
 *
 * manycat runs this against a web-search provider. Atlas has a model and no
 * search key, so the same brief is produced from the model's own knowledge and
 * labelled `provider: "model"` — the stage, the shape, and the plan it feeds
 * are identical, and swapping in a search provider later means changing only
 * how `chunks` are filled.
 */

const BRIEF_SYSTEM = [
  "You turn a one-line app request into a build brief for a coding agent.",
  "Reply with ONLY JSON:",
  "{",
  '  "productRef": string,           // short reference, e.g. "Casio-style calculator"',
  '  "summary": string,              // under 120 words, what to build and how it should look',
  '  "queries": string[],            // max 5, what you would look up to get this right',
  '  "chunks": [{"kind": "identity"|"visual"|"ux"|"reference"|"constraint",',
  '              "title": string, "content": string}],   // max 5',
  '  "targets": [{"title": string, "description": string, "doneWhen": string}], // max 4',
  '  "outOfScope": string[]          // max 4',
  "}",
  "Be concrete about layout, controls, and visual details. No preamble.",
].join("\n");

type RawBrief = {
  productRef?: string;
  summary?: string;
  queries?: unknown;
  chunks?: unknown;
  targets?: unknown;
  outOfScope?: unknown;
};

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string").slice(0, max)
    : [];

function parseChunks(v: unknown): ResearchChunk[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (c): c is Record<string, unknown> => typeof c === "object" && c !== null,
    )
    .slice(0, 5)
    .map((c) => ({
      id: randomUUID().slice(0, 8),
      kind: (
        ["identity", "visual", "ux", "reference", "constraint"] as const
      ).includes(c.kind as never)
        ? (c.kind as ResearchChunk["kind"])
        : "reference",
      title: typeof c.title === "string" ? c.title.slice(0, 120) : "Note",
      content: typeof c.content === "string" ? c.content.slice(0, 1_200) : "",
      sources: [],
    }))
    .filter((c) => c.content.length > 0);
}

function planFrom(
  prompt: string,
  raw: RawBrief,
  chunks: ResearchChunk[],
): ResearchPlan {
  const base = fallbackResearchPlan(prompt, raw.summary ?? "", chunks);
  const targets = Array.isArray(raw.targets)
    ? raw.targets
        .filter(
          (t): t is Record<string, unknown> =>
            typeof t === "object" && t !== null,
        )
        .slice(0, 4)
        .map((t, i) => ({
          id: `t${i}`,
          harness: "coder" as const,
          kind: "deliverable" as const,
          title:
            typeof t.title === "string"
              ? t.title.slice(0, 120)
              : `Target ${i + 1}`,
          description:
            typeof t.description === "string"
              ? t.description.slice(0, 400)
              : "",
          doneWhen:
            typeof t.doneWhen === "string"
              ? t.doneWhen.slice(0, 200)
              : "The described behaviour works.",
        }))
    : [];

  return {
    ...base,
    productRef: raw.productRef?.slice(0, 80) ?? base.productRef,
    // Model targets replace the generic pair; its steps still point at t0/t1,
    // so keep the defaults when the model gave us nothing to point at.
    targets: targets.length ? targets : base.targets,
    steps: targets.length
      ? targets.map((t, i) => ({
          id: `s${i}`,
          order: i + 1,
          title: t.title,
          detail: t.description || t.doneWhen,
          harness: "coder" as const,
          targetIds: [t.id],
        }))
      : base.steps,
    outOfScope: strings(raw.outOfScope, 4),
  };
}

export async function runResearchBrief(opts: {
  prompt: string;
}): Promise<ResearchBrief> {
  const started = Date.now();
  const empty = (provider: ResearchBrief["provider"]): ResearchBrief => ({
    prompt: opts.prompt,
    queries: [],
    summary: "",
    chunks: [],
    plan: fallbackResearchPlan(opts.prompt, "", []),
    durationMs: Date.now() - started,
    provider,
  });

  try {
    const res = await generate({
      system: BRIEF_SYSTEM,
      prompt: opts.prompt,
      maxTokens: 1500,
    });
    // The stub gateway returns prose, not JSON — that is "no research", not a
    // brief full of placeholder text the agent would then build against.
    if (res.stub) return empty("none");

    const match = /\{[\s\S]*\}/.exec(res.text)?.[0];
    if (!match) return empty("none");

    const raw = JSON.parse(match) as RawBrief;
    const chunks = parseChunks(raw.chunks);
    return {
      prompt: opts.prompt,
      queries: strings(raw.queries, 5),
      summary: raw.summary?.slice(0, 900) ?? "",
      chunks,
      plan: planFrom(opts.prompt, raw, chunks),
      durationMs: Date.now() - started,
      provider: "model",
    };
  } catch {
    return empty("none");
  }
}

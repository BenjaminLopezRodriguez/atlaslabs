import { eq } from "drizzle-orm";

import { db as database } from "@/server/db";
import { threads } from "@/server/db/schema";

import {
  emptyResearchPlan,
  type ResearchBrief,
  type ResearchPlan,
} from "./plan";

/**
 * Durable build context — shared by greenfield one-shot and repo modify.
 *
 * Ported from manycat's `server/workflow/context-pack.ts`. The pack is the
 * memory of the build: what kind of project this is, what was learned about
 * it, and what the agent was told to do. It lives in Postgres rather than in a
 * cache because a run three days later has to make the same decisions as the
 * first one.
 */

type Db = typeof database;

export type BuildOrigin = "greenfield" | "repo";
export type RunKind = "oneshot" | "understand" | "modify";

export type CodebaseBrief = {
  summary: string;
  stack: string[];
  entrypoints: string[];
  hotspots: string[];
  risks: string[];
};

export type ContextPack = {
  origin: BuildOrigin;
  prompt?: string;
  research?: ResearchBrief;
  codebase?: CodebaseBrief;
  /** Checkpoint the code graph was built from, so a stale graph is detectable. */
  graphRootHash?: string;
  plan: ResearchPlan;
  /** The tight contract handed to the agent as its primary ask. */
  buildContract?: string;
  /** True once the first greenfield oneshot has landed. */
  oneshotCompleted?: boolean;
  updatedAt: string;
};

export function emptyContextPack(
  origin: BuildOrigin,
  prompt?: string,
): ContextPack {
  return {
    origin,
    prompt,
    plan: emptyResearchPlan(prompt ?? ""),
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read a stored pack defensively.
 *
 * The column is JSONB written by an older deploy as often as by this one, so
 * every field is checked rather than cast. A malformed pack returns null and
 * the caller starts fresh, which is recoverable; a half-typed one is not.
 */
export function parseContextPack(raw: unknown): ContextPack | null {
  if (!isRecord(raw)) return null;
  const origin = raw.origin;
  if (origin !== "greenfield" && origin !== "repo") return null;

  const plan =
    isRecord(raw.plan) && typeof raw.plan.goal === "string"
      ? (raw.plan as unknown as ResearchPlan)
      : emptyResearchPlan(typeof raw.prompt === "string" ? raw.prompt : "");

  return {
    origin,
    prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
    research: isRecord(raw.research)
      ? (raw.research as unknown as ResearchBrief)
      : undefined,
    codebase: isRecord(raw.codebase)
      ? (raw.codebase as unknown as CodebaseBrief)
      : undefined,
    graphRootHash:
      typeof raw.graphRootHash === "string" ? raw.graphRootHash : undefined,
    plan,
    buildContract:
      typeof raw.buildContract === "string" ? raw.buildContract : undefined,
    oneshotCompleted: Boolean(raw.oneshotCompleted),
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export async function loadContextPack(
  threadId: string,
  db: Db = database,
): Promise<ContextPack | null> {
  const row = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: { contextPack: true },
  });
  return parseContextPack(row?.contextPack ?? null);
}

export async function saveContextPack(
  threadId: string,
  pack: ContextPack,
  db: Db = database,
): Promise<void> {
  const next: ContextPack = { ...pack, updatedAt: new Date().toISOString() };
  await db
    .update(threads)
    // Round-trip through JSON so a Date or undefined never reaches the column.
    .set({
      contextPack: JSON.parse(JSON.stringify(next)) as Record<string, unknown>,
    })
    .where(eq(threads.id, threadId));
}

/**
 * Which stage this turn is.
 *
 * The rule that matters: a repo that has never been read gets `understand`
 * before anything is allowed to write. That is what stops the agent from
 * scaffolding over somebody's project on its first turn.
 */
export function deriveRunKind(
  pack: ContextPack | null,
  opts?: { explicit?: RunKind; hasUserAsk?: boolean },
): RunKind {
  if (opts?.explicit) return opts.explicit;
  if (!pack) return "oneshot";

  if (pack.origin === "repo") {
    if (!pack.codebase) return "understand";
    return opts?.hasUserAsk === false ? "understand" : "modify";
  }

  if (!pack.oneshotCompleted) return "oneshot";
  return "modify";
}

/** The pack, trimmed for a prompt — full research chunks are too big to send. */
export function trimContextPack(pack: ContextPack): Record<string, unknown> {
  return {
    origin: pack.origin,
    prompt: pack.prompt,
    plan: pack.plan,
    buildContract: pack.buildContract,
    codebase: pack.codebase,
    graphRootHash: pack.graphRootHash,
    research: pack.research
      ? {
          summary: pack.research.summary,
          queries: pack.research.queries,
          plan: pack.research.plan,
          chunks: (pack.research.chunks ?? []).slice(0, 6),
        }
      : undefined,
    oneshotCompleted: pack.oneshotCompleted,
  };
}

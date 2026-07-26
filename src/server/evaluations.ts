import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  evaluationCases,
  evaluationRuns,
  specialistVersions,
  type specialists,
} from "@/server/db/schema";
import { generate } from "@/server/model/gateway";
import type { SpecialistManifest } from "@/server/specialist/manifest";

/**
 * Execute an evaluation suite against the specialist's current version and
 * store an immutable result attributable to that version (spec §8).
 *
 * ponytail: grading is keyword overlap between expectation and output —
 * deterministic and offline-safe. Swap for model-graded rubrics later.
 */
export async function runEvaluation(
  sp: typeof specialists.$inferSelect,
  suiteId: string,
  startedByUserId: string,
) {
  if (!sp.currentVersionId) throw new Error("Specialist has no version");
  const version = await db.query.specialistVersions.findFirst({
    where: eq(specialistVersions.id, sp.currentVersionId),
  });
  const manifest = (version?.manifest ?? {}) as Partial<SpecialistManifest>;

  const cases = await db.query.evaluationCases.findMany({
    where: eq(evaluationCases.suiteId, suiteId),
    orderBy: asc(evaluationCases.createdAt),
  });

  const [evalRun] = await db
    .insert(evaluationRuns)
    .values({
      suiteId,
      specialistVersionId: sp.currentVersionId,
      status: "running",
      startedByUserId,
    })
    .returning();

  const results: Record<string, unknown>[] = [];
  let passed = 0;
  let failed = 0;
  let criticalFailed = false;

  for (const c of cases) {
    const message =
      typeof c.input.message === "string"
        ? c.input.message
        : JSON.stringify(c.input);
    const { text } = await generate({
      system:
        `You are ${manifest.name ?? "an Atlas specialist"}. ` +
        `Purpose: ${manifest.purpose ?? ""}.` +
        (manifestExamples(manifest)
          ? `\nFollow these approved examples:\n${manifestExamples(manifest)}`
          : ""),
      prompt: message,
    });
    const ok = grade(text, c.expectation);
    if (ok) passed++;
    else {
      failed++;
      if (c.critical) criticalFailed = true;
    }
    results.push({ caseId: c.id, passed: ok, output: text.slice(0, 4000) });
  }

  const status =
    cases.length === 0 || criticalFailed || failed > passed
      ? "failed"
      : "passed";
  const [finished] = await db
    .update(evaluationRuns)
    .set({
      status,
      passedCases: passed,
      failedCases: failed,
      results,
      finishedAt: new Date(),
    })
    .where(eq(evaluationRuns.id, evalRun!.id))
    .returning();
  return finished!;
}

function manifestExamples(
  manifest: Partial<SpecialistManifest> & {
    examples?: { note: string; replacement?: string }[];
  },
): string {
  return (manifest.examples ?? [])
    .map(
      (e, i) =>
        `${i + 1}. ${e.note}${e.replacement ? `\n   Preferred: ${e.replacement}` : ""}`,
    )
    .join("\n");
}

/**
 * Keyword-overlap grade: at least half of the expectation's significant
 * words appear in the output (case-insensitive).
 */
export function grade(output: string, expectation: string): boolean {
  const words = [
    ...new Set(
      expectation
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    ),
  ];
  if (words.length === 0) return output.length > 0;
  const out = output.toLowerCase();
  const hits = words.filter((w) => out.includes(w)).length;
  return hits >= Math.ceil(words.length / 2);
}

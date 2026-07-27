import { and, asc, eq, sql } from "drizzle-orm";

import { audit } from "@/server/audit";
import { db } from "@/server/db";
import {
  artifacts,
  messages,
  runEvents,
  runs,
  sourceFiles,
  sources,
  specialistVersions,
  specialists,
  threads,
} from "@/server/db/schema";
import { generate } from "@/server/model/gateway";
import type { SpecialistManifest } from "@/server/specialist/manifest";
import { spaceTurnTick } from "@/server/spaces/turns";

/**
 * Postgres-backed run queue + local runtime adapter.
 * ponytail: single in-process worker over `FOR UPDATE SKIP LOCKED`; swap the
 * executor behind `executeRun` for isolated container/microVM runtimes.
 */

export async function startRun(opts: {
  specialistId: string;
  input: Record<string, unknown>;
  startedByUserId?: string;
  serviceKeyId?: string;
  threadId?: string;
  idempotencyKey?: string;
  /** Frozen version to execute (deployments); defaults to current. */
  specialistVersionId?: string;
}) {
  const sp = await db.query.specialists.findFirst({
    where: eq(specialists.id, opts.specialistId),
  });
  const versionId = opts.specialistVersionId ?? sp?.currentVersionId;
  if (!sp || !versionId) {
    throw new Error("Specialist has no current version");
  }

  if (opts.idempotencyKey) {
    const existing = await db.query.runs.findFirst({
      where: and(
        eq(runs.specialistId, sp.id),
        eq(runs.idempotencyKey, opts.idempotencyKey),
      ),
    });
    if (existing) return existing;
  }

  // Freeze the sources visible to this run (traceability, spec §12).
  const wsSources = await db.query.sources.findMany({
    where: and(
      eq(sources.workspaceId, sp.workspaceId),
      eq(sources.status, "ready"),
    ),
    columns: { id: true, currentVersionId: true },
  });
  const sourceSnapshot = wsSources
    .filter((s) => s.currentVersionId)
    .map((s) => ({ sourceId: s.id, sourceVersionId: s.currentVersionId! }));

  const [run] = await db
    .insert(runs)
    .values({
      specialistId: sp.id,
      specialistVersionId: versionId,
      threadId: opts.threadId,
      sourceSnapshot,
      status: "queued",
      input: opts.input,
      idempotencyKey: opts.idempotencyKey,
      startedByUserId: opts.startedByUserId,
      serviceKeyId: opts.serviceKeyId,
    })
    .returning();
  await emitEvent(run!.id, "queued", {});
  return run!;
}

export async function emitEvent(
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await db.insert(runEvents).values({
    runId,
    kind,
    payload,
    seq: sql`(select coalesce(max(seq), 0) + 1 from ${runEvents} where ${runEvents.runId} = ${runId})`,
  });
}

/** Claim the oldest queued run. Safe across concurrent workers. */
export async function claimNextRun() {
  const claimed = await db.execute(sql`
    update ${runs} set status = 'running', "startedAt" = now()
    where id = (
      select id from ${runs}
      where status = 'queued'
      order by "created_at" asc
      for update skip locked
      limit 1
    )
    returning id
  `);
  const row = (claimed as unknown as { id: string }[])[0];
  if (!row) return null;
  return db.query.runs.findFirst({ where: eq(runs.id, row.id) });
}

/** Execute one run to completion (local runtime adapter). */
export async function executeRun(run: typeof runs.$inferSelect) {
  try {
    await emitEvent(run.id, "started", {});

    const version = await db.query.specialistVersions.findFirst({
      where: eq(specialistVersions.id, run.specialistVersionId),
    });
    const manifest = (version?.manifest ?? {}) as Partial<SpecialistManifest>;

    // Assemble context from the frozen source snapshot.
    const snapshot = run.sourceSnapshot ?? [];
    const contextParts: string[] = [];
    for (const snap of snapshot) {
      const files = await db.query.sourceFiles.findMany({
        where: eq(sourceFiles.sourceVersionId, snap.sourceVersionId!),
        orderBy: asc(sourceFiles.path),
        limit: 200,
      });
      for (const f of files) {
        contextParts.push(`### FILE: ${f.path}\n${f.content}`);
      }
    }
    await emitEvent(run.id, "context_assembled", {
      sources: snapshot.length,
      files: contextParts.length,
    });

    const userInput =
      typeof run.input.message === "string"
        ? run.input.message
        : JSON.stringify(run.input);

    const result = await generate({
      system:
        `You are ${manifest.name ?? "an Atlas specialist"}. ` +
        `Purpose: ${manifest.purpose ?? "assist the user"}. ` +
        `Respond with a structured, actionable answer.`,
      prompt:
        contextParts.length > 0
          ? `${userInput}\n\n## Connected sources\n${contextParts.join("\n\n")}`
          : userInput,
    });
    await emitEvent(run.id, "model_response", {
      model: result.model,
      stub: result.stub,
    });

    const [artifact] = await db
      .insert(artifacts)
      .values({
        runId: run.id,
        name: "result.md",
        contentType: "text/markdown",
        content: result.text,
        bytes: Buffer.byteLength(result.text),
      })
      .returning();

    // Post the result into the chat thread when one is attached.
    if (run.threadId) {
      const thread = await db.query.threads.findFirst({
        where: eq(threads.id, run.threadId),
      });
      if (thread) {
        await db.insert(messages).values({
          threadId: thread.id,
          seq: sql`(select coalesce(max(seq), 0) + 1 from ${messages} where ${messages.threadId} = ${thread.id})`,
          role: "assistant",
          content: result.text,
          meta: { runId: run.id, artifactId: artifact!.id },
        });
      }
    }

    await db
      .update(runs)
      .set({
        status: "succeeded",
        output: { artifactId: artifact!.id, model: result.model },
        finishedAt: new Date(),
      })
      .where(eq(runs.id, run.id));
    await emitEvent(run.id, "succeeded", { artifactId: artifact!.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(runs)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(runs.id, run.id));
    await emitEvent(run.id, "failed", { error: message });
    await audit({
      action: "run.failed",
      detail: { type: "run", id: run.id, error: message },
    });
  }
}

/** One worker tick: claim + execute a single run. Returns false when idle. */
export async function workerTick(): Promise<boolean> {
  const run = await claimNextRun();
  if (run) {
    await executeRun(run);
    return true;
  }
  // Space turns share the worker rather than a process of their own: both are
  // Postgres-claimed queues, and one loop is one thing to keep running.
  return spaceTurnTick();
}

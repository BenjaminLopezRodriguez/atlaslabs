import { and, eq, sql } from "drizzle-orm";

import { runBuildTurn } from "@/server/build/pipeline";
import { db as database } from "@/server/db";
import { messages, spaceTurns } from "@/server/db/schema";
import { getMachine, getMachineFile } from "@/server/machines/store";
import type { Progress } from "@/server/spaces/agent";

/**
 * Queue for space-thread agent turns.
 *
 * A turn runs the build pipeline against a real VM and takes minutes, so it
 * cannot live inside the HTTP request that asked for it: a refresh would
 * abandon it and any proxy in front would time it out. The request enqueues
 * and returns; the worker executes and writes the answer into the reply row
 * the thread is already polling.
 */

/** A worker that dies mid-turn leaves a claim behind; take it back after this. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/** A turn that keeps killing its worker is a bug, not bad luck. Stop retrying. */
const MAX_ATTEMPTS = 3;

/** Floor between streamed-text writes, so a fast model can't flood Postgres. */
const STREAM_FLUSH_MS = 600;

export async function enqueueSpaceTurn(
  input: {
    threadId: string;
    messageId: string;
    machineId: string;
    userId: string;
    userAsk: string;
    paths?: string[];
    runKind?: "oneshot" | "understand" | "modify";
  },
  db = database,
) {
  const [turn] = await db
    .insert(spaceTurns)
    .values({
      threadId: input.threadId,
      messageId: input.messageId,
      machineId: input.machineId,
      userId: input.userId,
      userAsk: input.userAsk,
      paths: input.paths ?? [],
      runKind: input.runKind,
    })
    .returning();
  return turn!;
}

/**
 * Claim the oldest runnable turn. Safe across concurrent workers.
 *
 * Reclaims stale `running` rows in the same statement: a turn whose worker
 * died is indistinguishable from one still going except by age, and leaving
 * it claimed forever is exactly the stuck spinner this queue exists to fix.
 */
export async function claimNextSpaceTurn(db = database) {
  const claimed = await db.execute(sql`
    update ${spaceTurns} set
      status = 'running',
      "claimedAt" = now(),
      attempts = attempts + 1
    where id = (
      select id from ${spaceTurns}
      where attempts < ${MAX_ATTEMPTS}
        and (
          status = 'queued'
          or (
            status = 'running'
            and "claimedAt" < now() - ${STALE_CLAIM_MS} * interval '1 millisecond'
          )
        )
      order by "created_at" asc
      for update skip locked
      limit 1
    )
    returning id
  `);
  const row = (claimed as unknown as { id: string }[])[0];
  if (!row) return null;
  return db.query.spaceTurns.findFirst({ where: eq(spaceTurns.id, row.id) });
}

/** Give up on turns that burned every attempt without finishing. */
export async function failExhaustedTurns(db = database) {
  const dead = await db
    .update(spaceTurns)
    .set({
      status: "failed",
      error: "The worker stopped before this turn finished.",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(spaceTurns.status, "running"),
        // Postgres' clock, not this process's: workers do not share one.
        sql`"claimedAt" < now() - ${STALE_CLAIM_MS} * interval '1 millisecond'`,
        sql`attempts >= ${MAX_ATTEMPTS}`,
      ),
    )
    .returning();

  for (const turn of dead) {
    await writeReply(
      turn.messageId,
      `I could not finish that: ${turn.error}`,
      null,
      db,
    );
  }
  return dead.length;
}

/** Execute one claimed turn to completion. Never throws — it records instead. */
export async function executeSpaceTurn(
  turn: typeof spaceTurns.$inferSelect,
  db = database,
) {
  // The last phase reported, so a failure can say where it died rather than
  // surfacing a bare exception with no context.
  let phase: string | null = null;
  const progress: Progress[] = [];
  // Reply text as the model writes it, shown before the turn finishes.
  let partial = "";
  let lastFlush = 0;
  // Writes are chained rather than fired in parallel: two in-flight updates to
  // the same row can land out of order and rewind the visible text.
  let flushing: Promise<void> = Promise.resolve();

  const flushMeta = () => {
    flushing = flushing.then(async () => {
      await db
        .update(messages)
        .set({
          meta: { running: true, progress, partial: partial || undefined },
        })
        .where(eq(messages.id, turn.messageId))
        .catch(() => undefined);
    });
    return flushing;
  };

  try {
    const machine = await getMachine(turn.userId, turn.machineId);
    if (!machine) throw new Error("This thread's space no longer exists.");

    const prior = await db.query.messages.findMany({
      where: eq(messages.threadId, turn.threadId),
      orderBy: (m, { asc }) => asc(m.seq),
    });

    const pinned = await pinFiles(machine, turn.paths ?? []);

    const result = await runBuildTurn({
      machine,
      threadId: turn.threadId,
      userAsk: pinned ? `${turn.userAsk}\n\n${pinned}` : turn.userAsk,
      history: prior
        .filter((m) => m.id !== turn.messageId && m.role !== "system")
        .map((m) => ({
          role:
            m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
      userId: turn.userId,
      runKind: (turn.runKind ?? undefined) as
        "oneshot" | "understand" | "modify" | undefined,
      db,
      onProgress: async (p) => {
        phase = p.detail ?? p.phase;
        progress.push(p);
        await flushMeta();
      },
      onReplyText: (text) => {
        partial = text;
        // ponytail: time-throttled writes, not a push channel. The client polls
        // at ~1.2s, so flushing faster than this buys nothing; swap for
        // LISTEN/NOTIFY if the chunkiness ever bothers anyone.
        if (Date.now() - lastFlush < STREAM_FLUSH_MS) return;
        lastFlush = Date.now();
        void flushMeta();
      },
    });

    // A throttled write still in flight would land after the final content and
    // put the row back into `running`, so let it finish first.
    await flushing;

    await writeReply(
      turn.messageId,
      result.text,
      {
        runKind: result.runKind,
        origin: result.pack.origin,
        productRef: result.pack.plan.productRef || undefined,
        plan: result.agent?.plan ?? [],
        editIds: (result.agent?.edits ?? []).map((e) => e.id),
        steps: result.agent?.steps ?? [],
      },
      db,
    );
    await db
      .update(spaceTurns)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(spaceTurns.id, turn.id));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Where it died is most of the diagnosis, and progress already knows.
    const message = phase
      ? `I could not finish that. Failed while ${lower(phase)}: ${detail}`
      : `I could not finish that: ${detail}`;

    // Same race as the success path, and worse here: a late write would leave
    // a failed turn showing as still running, forever.
    await flushing;
    await writeReply(turn.messageId, message, null, db);
    await db
      .update(spaceTurns)
      .set({ status: "failed", error: detail, finishedAt: new Date() })
      .where(eq(spaceTurns.id, turn.id));
  }
}

/** Finish the reply row: real content, and `running` cleared either way. */
async function writeReply(
  messageId: string,
  content: string,
  meta: Record<string, unknown> | null,
  db = database,
) {
  await db
    .update(messages)
    .set({ content, meta })
    .where(eq(messages.id, messageId));
}

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** One unit of space-turn work. Returns false when the queue is empty. */
export async function spaceTurnTick(db = database): Promise<boolean> {
  await failExhaustedTurns(db);
  const turn = await claimNextSpaceTurn(db);
  if (!turn) return false;
  await executeSpaceTurn(turn, db);
  return true;
}

/** Budget for @-mentioned file contents pinned into the prompt. */
const MAX_PINNED_BYTES = 24_000;

/** Inline the contents of files the user @-mentioned, within a byte budget. */
async function pinFiles(
  machine: Awaited<ReturnType<typeof getMachine>>,
  paths: string[],
): Promise<string> {
  if (!machine || !paths.length) return "";
  const blocks: string[] = [];
  let budget = MAX_PINNED_BYTES;

  for (const path of paths) {
    if (budget <= 0) break;
    let body: string;
    try {
      const bytes = await getMachineFile(machine, path);
      body = bytes
        ? Buffer.from(bytes).toString("utf8")
        : `(no file at ${path})`;
    } catch (err) {
      body = `(could not read ${path}: ${
        err instanceof Error ? err.message : String(err)
      })`;
    }
    const clipped = body.slice(0, budget);
    budget -= clipped.length;
    blocks.push(
      `--- ${path} ---\n${clipped}${clipped.length < body.length ? "\n… truncated" : ""}`,
    );
  }

  return blocks.length
    ? `The user referenced these files:\n\n${blocks.join("\n\n")}`
    : "";
}

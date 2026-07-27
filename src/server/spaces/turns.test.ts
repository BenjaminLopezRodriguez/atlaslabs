import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ATLAS_MACHINE_DRIVER = "mock";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  machines,
  messages,
  spaceTurns,
  threads,
  users,
  workspaces,
} from "@/server/db/schema";
import { createMachine } from "@/server/machines/store";
import {
  claimNextSpaceTurn,
  enqueueSpaceTurn,
  failExhaustedTurns,
} from "@/server/spaces/turns";

const owner = `user_turns_${randomUUID().slice(0, 8)}`;

void after(async () => {
  const ws = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, owner),
  });
  const ids = ws.map((w) => w.id);
  if (ids.length) {
    await db.delete(threads).where(inArray(threads.workspaceId, ids));
    await db.delete(machines).where(inArray(machines.workspaceId, ids));
  }
  await db.delete(workspaces).where(eq(workspaces.userId, owner));
  await db.delete(users).where(inArray(users.id, [owner]));
  process.exit(0);
});

/**
 * The queue is global, so a turn left behind by an earlier test would be the
 * one claimed here. Each test starts from an empty queue.
 */
async function clearTurns() {
  await db.delete(spaceTurns).where(eq(spaceTurns.userId, owner));
}

/** A thread bound to a space, plus the empty reply row a turn fills in. */
async function seedThread() {
  await db
    .insert(users)
    .values({ id: owner, email: `${owner}@test.local` })
    .onConflictDoNothing();
  const machine = await createMachine({
    userId: owner,
    slug: `turns-${randomUUID().slice(0, 6)}`,
  });
  const [thread] = await db
    .insert(threads)
    .values({
      workspaceId: machine.workspaceId,
      title: "New chat",
      machineId: machine.id,
      createdByUserId: owner,
    })
    .returning();
  const [reply] = await db
    .insert(messages)
    .values({
      threadId: thread!.id,
      seq: 1,
      role: "assistant",
      content: "",
      meta: { running: true, progress: [] },
    })
    .returning();
  return { machine, thread: thread!, reply: reply! };
}

void test("a queued turn is claimed exactly once, even by racing workers", async () => {
  await clearTurns();
  const { machine, thread, reply } = await seedThread();
  await enqueueSpaceTurn({
    threadId: thread.id,
    messageId: reply.id,
    machineId: machine.id,
    userId: owner,
    userAsk: "build it",
  });

  // Two workers reaching for the same queue must not both get the turn:
  // the agent drives a real VM, so running it twice doubles the side effects.
  const [a, b] = await Promise.all([
    claimNextSpaceTurn(),
    claimNextSpaceTurn(),
  ]);
  const claimed = [a, b].filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]!.status, "running");
  assert.equal(claimed[0]!.attempts, 1);
});

void test("a second turn is refused while one is still in flight", async () => {
  await clearTurns();
  const { machine, thread, reply } = await seedThread();
  const base = {
    threadId: thread.id,
    messageId: reply.id,
    machineId: machine.id,
    userId: owner,
    userAsk: "build it",
  };
  await enqueueSpaceTurn(base);

  // The live-turn index is what stops two agents editing the same VM at once.
  await assert.rejects(() => enqueueSpaceTurn(base));
});

void test("a turn whose worker died is reclaimed, then failed for good", async () => {
  await clearTurns();
  const { machine, thread, reply } = await seedThread();
  const turn = await enqueueSpaceTurn({
    threadId: thread.id,
    messageId: reply.id,
    machineId: machine.id,
    userId: owner,
    userAsk: "build it",
  });

  // Simulate a worker that claimed the turn and then died: still `running`,
  // but claimed long enough ago that nothing is plausibly working on it.
  const stale = async (attempts: number) =>
    db
      .update(spaceTurns)
      .set({
        status: "running",
        attempts,
        claimedAt: sql`now() - interval '1 hour'`,
      })
      .where(eq(spaceTurns.id, turn.id));

  await stale(1);
  const reclaimed = await claimNextSpaceTurn();
  assert.equal(reclaimed?.id, turn.id, "a stale claim is taken back");
  assert.equal(reclaimed?.attempts, 2);

  // Once the attempts are spent it stops being retried and becomes an answer,
  // so the thread shows an error instead of throbbing forever.
  await stale(3);
  assert.equal(await failExhaustedTurns(), 1);

  const row = await db.query.spaceTurns.findFirst({
    where: eq(spaceTurns.id, turn.id),
  });
  assert.equal(row?.status, "failed");
  assert.equal(await claimNextSpaceTurn(), null);

  const finished = await db.query.messages.findFirst({
    where: eq(messages.id, reply.id),
  });
  assert.match(finished!.content, /could not finish/);
  assert.equal(
    (finished!.meta as { running?: boolean } | null)?.running,
    undefined,
    "the reply stops rendering as in-flight",
  );
});

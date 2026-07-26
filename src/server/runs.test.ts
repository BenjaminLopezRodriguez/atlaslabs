import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

// Deterministic offline runs — never call a real model provider from tests.
process.env.ANTHROPIC_API_KEY = "";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { groups, messages, runs, users, workspaces } from "@/server/db/schema";
import { getPersonalWorkspace } from "@/server/authz";
import { grade } from "@/server/evaluations";
import { startRun, workerTick } from "@/server/runs";
import { createSpecialistFromPrompt } from "@/server/specialist/create";

const uid = `user_runtest_${randomUUID().slice(0, 8)}`;

void after(async () => {
  // Delete workspace first: message.authorUserId is a non-deferrable FK, so
  // the user row can't go while chat messages still reference it.
  await db.delete(workspaces).where(eq(workspaces.userId, uid));
  await db.delete(groups).where(eq(groups.createdByUserId, uid));
  await db.delete(users).where(eq(users.id, uid));
  process.exit(0);
});

void test("run pipeline: enqueue → worker → assistant message + artifact", async () => {
  await db.insert(users).values({ id: uid, email: `${uid}@test.local` });
  const ws = await getPersonalWorkspace(db, uid);
  const { specialist, threadId } = await createSpecialistFromPrompt(
    db,
    uid,
    ws,
    "Review our architecture decisions",
  );

  const run = await startRun({
    specialistId: specialist.id,
    input: { message: "Review the login flow" },
    startedByUserId: uid,
    threadId,
  });
  assert.equal(run.status, "queued");

  // Drain the queue (may contain leftovers from previous local runs).
  let finished = await db.query.runs.findFirst({ where: eq(runs.id, run.id) });
  for (let i = 0; i < 20 && finished?.status === "queued"; i++) {
    await workerTick();
    finished = await db.query.runs.findFirst({ where: eq(runs.id, run.id) });
  }
  assert.equal(finished?.status, "succeeded");

  const thread = await db.query.messages.findMany({
    where: eq(messages.threadId, threadId),
  });
  const assistant = thread.filter((m) => m.role === "assistant");
  // Seeded draft reply + run result.
  assert.ok(assistant.length >= 2);
  assert.ok(
    assistant.some((m) => (m.meta as { runId?: string })?.runId === run.id),
  );
});

void test("idempotency key dedupes runs", async () => {
  const ws = await getPersonalWorkspace(db, uid);
  const { specialist } = await createSpecialistFromPrompt(
    db,
    uid,
    ws,
    "Second specialist for idempotency",
  );
  const a = await startRun({
    specialistId: specialist.id,
    input: { message: "x" },
    idempotencyKey: "same-key",
  });
  const b = await startRun({
    specialistId: specialist.id,
    input: { message: "x" },
    idempotencyKey: "same-key",
  });
  assert.equal(a.id, b.id);
});

void test("grade keyword overlap", () => {
  assert.ok(grade("The login flow lacks rate limiting", "login rate limiting"));
  assert.ok(!grade("Nothing to see here", "database migration ordering issue"));
});

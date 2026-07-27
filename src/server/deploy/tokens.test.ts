import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ATLAS_MACHINE_DRIVER = "mock";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { machines, users, workspaces } from "@/server/db/schema";
import {
  claimNotification,
  MAX_NOTIFICATIONS,
  mintDeployToken,
  revokeDeployTokens,
  verifyDeployToken,
} from "@/server/deploy/tokens";
import { createMachine } from "@/server/machines/store";

const owner = `user_deploy_${randomUUID().slice(0, 8)}`;

void after(async () => {
  const ws = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, owner),
  });
  const ids = ws.map((w) => w.id);
  if (ids.length) {
    await db.delete(machines).where(inArray(machines.workspaceId, ids));
    await db.delete(workspaces).where(inArray(workspaces.id, ids));
  }
  await db.delete(users).where(eq(users.id, owner));
});

async function seedMachine() {
  await db
    .insert(users)
    .values({ id: owner, email: `${owner}@example.test` })
    .onConflictDoNothing();
  return createMachine({
    userId: owner,
    slug: `dt-${randomUUID().slice(0, 6)}`,
  });
}

const req = (token: string | null) =>
  new Request("https://atlas.test/api/v1/vm/heartbeat", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

void test("a minted token authenticates its own machine", async () => {
  const machine = await seedMachine();
  const { token } = await mintDeployToken({
    machine,
    createdByUserId: owner,
  });

  const verified = await verifyDeployToken(req(token));
  assert.equal(verified?.machineId, machine.id);
  assert.equal(verified?.workspaceId, machine.workspaceId);
});

void test("minting again revokes the previous deployment's token", async () => {
  const machine = await seedMachine();
  const first = await mintDeployToken({ machine, createdByUserId: owner });
  const second = await mintDeployToken({ machine, createdByUserId: owner });

  assert.equal(await verifyDeployToken(req(first.token)), null);
  assert.ok(await verifyDeployToken(req(second.token)));
});

void test("revocation takes effect immediately", async () => {
  const machine = await seedMachine();
  const { token } = await mintDeployToken({ machine, createdByUserId: owner });
  await revokeDeployTokens(machine.id);
  assert.equal(await verifyDeployToken(req(token)), null);
});

void test("an expired token is refused", async () => {
  const machine = await seedMachine();
  const { token } = await mintDeployToken({
    machine,
    createdByUserId: owner,
    ttlMs: -1,
  });
  assert.equal(await verifyDeployToken(req(token)), null);
});

void test("user and service credentials are not deploy tokens", async () => {
  assert.equal(await verifyDeployToken(req("atlas_pat_whatever")), null);
  assert.equal(await verifyDeployToken(req("atlas_sk_whatever")), null);
  assert.equal(await verifyDeployToken(req(null)), null);
});

void test("the notification budget is finite and cannot be double-spent", async () => {
  const machine = await seedMachine();
  const { token } = await mintDeployToken({ machine, createdByUserId: owner });
  const row = (await verifyDeployToken(req(token)))!;

  assert.equal(await claimNotification(row), true);

  // Both callers hold the same pre-claim snapshot; only one may win, or a
  // crash-looping container could spend the same slot forever.
  const stale = { ...row, notifyCount: row.notifyCount };
  assert.equal(await claimNotification(stale), false);

  const spent = { ...row, notifyCount: MAX_NOTIFICATIONS };
  assert.equal(await claimNotification(spent), false);
});

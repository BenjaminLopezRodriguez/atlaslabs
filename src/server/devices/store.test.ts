import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ANTHROPIC_API_KEY = "";

import { eq, inArray } from "drizzle-orm";

import { sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { cliTokens, devices, users } from "@/server/db/schema";
import {
  listDevices,
  resolveDevice,
  revokeDevice,
} from "@/server/devices/store";

const uidA = `user_devtest_a_${randomUUID().slice(0, 8)}`;
const uidB = `user_devtest_b_${randomUUID().slice(0, 8)}`;

void after(async () => {
  await db.delete(cliTokens).where(inArray(cliTokens.userId, [uidA, uidB]));
  await db.delete(devices).where(inArray(devices.userId, [uidA, uidB]));
  await db.delete(users).where(inArray(users.id, [uidA, uidB]));
  process.exit(0);
});

async function seedUsers() {
  await db
    .insert(users)
    .values([
      { id: uidA, email: `${uidA}@test.local` },
      { id: uidB, email: `${uidB}@test.local` },
    ])
    .onConflictDoNothing();
}

void test("same installationId + same user re-login reuses the device", async () => {
  await seedUsers();
  const installationId = `inst_${randomUUID()}`;

  const first = await resolveDevice({
    userId: uidA,
    installationId,
    kind: "cli",
    label: "Benji's MacBook",
    platform: "macOS 27",
  });
  const second = await resolveDevice({
    userId: uidA,
    installationId,
    kind: "cli",
    platform: "macOS 27",
  });

  assert.equal(second.id, first.id, "re-login must keep one device identity");
  assert.equal(second.label, "Benji's MacBook", "label is not clobbered");
  assert.ok(second.lastSeenAt);
});

/*
 * The security test. A forged installation id must never let one user attach to
 * another user's device row.
 */
void test("same installationId + DIFFERENT user never merges", async () => {
  await seedUsers();
  const installationId = `inst_${randomUUID()}`;

  const mine = await resolveDevice({
    userId: uidA,
    installationId,
    kind: "cli",
  });
  const theirs = await resolveDevice({
    userId: uidB,
    installationId,
    kind: "cli",
  });

  assert.notEqual(theirs.id, mine.id);
  assert.equal(theirs.userId, uidB);
  assert.equal(mine.userId, uidA);
});

void test("absent installationId mints a new device each time", async () => {
  await seedUsers();
  const one = await resolveDevice({ userId: uidA, kind: "web" });
  const two = await resolveDevice({ userId: uidA, kind: "web" });

  assert.notEqual(one.id, two.id);
  assert.equal(one.label, "Web", "falls back to a kind-based label");
  assert.equal(one.installationId, null);
});

void test("revoking a device kills its tokens and frees the install id", async () => {
  await seedUsers();
  const installationId = `inst_${randomUUID()}`;

  const device = await resolveDevice({
    userId: uidA,
    installationId,
    kind: "cli",
  });

  const secret = `atlas_pat_${randomUUID()}`;
  await db.insert(cliTokens).values({
    userId: uidA,
    tokenHash: sha256(secret),
    tokenPrefix: secret.slice(0, 14),
    deviceId: device.id,
  });

  assert.equal(await revokeDevice({ userId: uidA, deviceId: device.id }), true);

  const token = await db.query.cliTokens.findFirst({
    where: eq(cliTokens.tokenHash, sha256(secret)),
  });
  assert.ok(token?.revokedAt, "revoking a device revokes its tokens");

  const row = await db.query.devices.findFirst({
    where: eq(devices.id, device.id),
  });
  assert.ok(row, "revoked devices are never deleted — audit references them");
  assert.ok(row?.revokedAt);
  assert.equal(row?.installationId, null);

  // the same physical device signing in again earns a fresh row
  const fresh = await resolveDevice({
    userId: uidA,
    installationId,
    kind: "cli",
  });
  assert.notEqual(fresh.id, device.id);
  assert.equal(fresh.revokedAt, null);
});

void test("revoke is scoped to the caller", async () => {
  await seedUsers();
  const device = await resolveDevice({ userId: uidA, kind: "ios" });

  assert.equal(
    await revokeDevice({ userId: uidB, deviceId: device.id }),
    false,
    "another user's revoke must not succeed",
  );

  const row = await db.query.devices.findFirst({
    where: eq(devices.id, device.id),
  });
  assert.equal(row?.revokedAt, null);
});

void test("listDevices returns only the caller's devices", async () => {
  await seedUsers();
  await resolveDevice({ userId: uidA, kind: "desktop" });
  await resolveDevice({ userId: uidB, kind: "desktop" });

  const mine = await listDevices(uidA);
  assert.ok(mine.length > 0);
  assert.ok(mine.every((d) => d.userId === uidA));
});

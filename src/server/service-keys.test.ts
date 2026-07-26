import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ANTHROPIC_API_KEY = "";

import { eq } from "drizzle-orm";

import { getPersonalWorkspace } from "@/server/authz";
import { db } from "@/server/db";
import { users, workspaces } from "@/server/db/schema";
import { activeDeployment, deploySpecialist } from "@/server/deployments";
import { createSpecialistFromPrompt } from "@/server/specialist/create";
import {
  createServiceKey,
  revokeServiceKey,
  verifyServiceKey,
} from "@/server/service-keys";

const uid = `user_sktest_${randomUUID().slice(0, 8)}`;

void after(async () => {
  await db.delete(workspaces).where(eq(workspaces.userId, uid));
  await db.delete(users).where(eq(users.id, uid));
  process.exit(0);
});

function reqWith(token: string) {
  return new Request("http://localhost/x", {
    headers: { authorization: `Bearer ${token}` },
  });
}

void test("service key mint / scope / revoke lifecycle", async () => {
  await db.insert(users).values({ id: uid, email: `${uid}@test.local` });
  const ws = await getPersonalWorkspace(db, uid);
  const { specialist } = await createSpecialistFromPrompt(
    db,
    uid,
    ws,
    "Key lifecycle specialist",
  );

  const key = await createServiceKey({
    workspace: ws,
    specialistId: specialist.id,
    label: "test",
    scopes: ["specialist:invoke", "runs:read"],
    createdByUserId: uid,
  });
  assert.ok(key.secret.startsWith("atlas_sk_"));

  // Valid scope verifies; missing scope denies; garbage denies.
  assert.ok(await verifyServiceKey(reqWith(key.secret), "specialist:invoke"));
  assert.equal(
    await verifyServiceKey(reqWith(key.secret), "artifacts:read"),
    null,
  );
  assert.equal(
    await verifyServiceKey(reqWith("atlas_sk_bogus"), "specialist:invoke"),
    null,
  );

  // Revocation is immediate.
  await revokeServiceKey(key.id, null, uid);
  assert.equal(
    await verifyServiceKey(reqWith(key.secret), "specialist:invoke"),
    null,
  );
});

void test("deployment freezes version and is discoverable", async () => {
  const ws = await getPersonalWorkspace(db, uid);
  const { specialist } = await createSpecialistFromPrompt(
    db,
    uid,
    ws,
    "Deployment gating specialist",
  );
  // No evaluation suite yet → deploy allowed (recorded ungated).
  const dep = await deploySpecialist(specialist, null, uid);
  assert.equal(dep.specialistVersionId, specialist.currentVersionId);
  const active = await activeDeployment(specialist.id);
  assert.equal(active?.id, dep.id);
});

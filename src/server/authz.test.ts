import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { db } from "@/server/db";
import { groups, memberships, users, workspaces } from "@/server/db/schema";
import {
  getPersonalWorkspace,
  requireGroupRole,
  requireWorkspaceAccess,
  roleAtLeast,
} from "@/server/authz";

const uid = () => `user_test_${randomUUID().slice(0, 8)}`;

async function makeUser() {
  const id = uid();
  await db.insert(users).values({ id, email: `${id}@test.local` });
  return id;
}

async function makeGroup(ownerId: string) {
  const [g] = await db
    .insert(groups)
    .values({
      name: "Test Group",
      slug: `test-${randomUUID().slice(0, 8)}`,
      createdByUserId: ownerId,
    })
    .returning();
  await db
    .insert(memberships)
    .values({ groupId: g!.id, userId: ownerId, role: "owner" });
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Test WS", groupId: g!.id })
    .returning();
  return { group: g!, workspace: ws! };
}

const createdUsers: string[] = [];

void after(async () => {
  // Cascades remove groups/memberships/workspaces created by these users' tests.
  for (const id of createdUsers) {
    const { eq } = await import("drizzle-orm");
    await db.delete(groups).where(eq(groups.createdByUserId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  process.exit(0);
});

void test("role ordering", () => {
  assert.ok(roleAtLeast("owner", "viewer"));
  assert.ok(roleAtLeast("builder", "operator"));
  assert.ok(!roleAtLeast("viewer", "operator"));
  assert.ok(!roleAtLeast("operator", "builder"));
});

void test("non-member is denied group access (cross-group isolation)", async () => {
  const owner = await makeUser();
  const outsider = await makeUser();
  createdUsers.push(owner, outsider);
  const { group } = await makeGroup(owner);

  assert.equal(await requireGroupRole(db, owner, group.id, "owner"), "owner");
  await assert.rejects(
    () => requireGroupRole(db, outsider, group.id, "viewer"),
    /FORBIDDEN|Not authorized/,
  );
});

void test("insufficient role is denied", async () => {
  const owner = await makeUser();
  const viewer = await makeUser();
  createdUsers.push(owner, viewer);
  const { group } = await makeGroup(owner);
  await db
    .insert(memberships)
    .values({ groupId: group.id, userId: viewer, role: "viewer" });

  assert.equal(
    await requireGroupRole(db, viewer, group.id, "viewer"),
    "viewer",
  );
  await assert.rejects(() => requireGroupRole(db, viewer, group.id, "builder"));
});

void test("member of group A cannot access group B workspace", async () => {
  const ownerA = await makeUser();
  const ownerB = await makeUser();
  createdUsers.push(ownerA, ownerB);
  await makeGroup(ownerA);
  const { workspace: wsB } = await makeGroup(ownerB);

  await assert.rejects(() =>
    requireWorkspaceAccess(db, ownerA, wsB.id, "viewer"),
  );
});

void test("personal workspace admits only its owner", async () => {
  const me = await makeUser();
  const other = await makeUser();
  createdUsers.push(me, other);
  const ws = await getPersonalWorkspace(db, me);
  assert.equal(ws.userId, me);
  // Idempotent.
  assert.equal((await getPersonalWorkspace(db, me)).id, ws.id);

  const ok = await requireWorkspaceAccess(db, me, ws.id, "owner");
  assert.equal(ok.role, "owner");
  await assert.rejects(() =>
    requireWorkspaceAccess(db, other, ws.id, "viewer"),
  );
});

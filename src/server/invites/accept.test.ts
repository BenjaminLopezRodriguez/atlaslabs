import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { groups, invitations, memberships, users } from "@/server/db/schema";
import { inviteToGroup } from "@/server/groups";
import { acceptInvitation } from "@/server/invites/accept";

const inviter = `user_inv_a_${randomUUID().slice(0, 8)}`;
const invitee = `user_inv_b_${randomUUID().slice(0, 8)}`;
const other = `user_inv_c_${randomUUID().slice(0, 8)}`;
const groupId = `group_inv_${randomUUID().slice(0, 8)}`;
const ids = [inviter, invitee, other];

const emailOf = (id: string) => `${id}@test.local`;

void after(async () => {
  await db.delete(invitations).where(eq(invitations.groupId, groupId));
  await db.delete(memberships).where(eq(memberships.groupId, groupId));
  await db.delete(groups).where(eq(groups.id, groupId));
  await db.delete(users).where(inArray(users.id, ids));
  process.exit(0);
});

async function seed() {
  await db
    .insert(users)
    .values(ids.map((id) => ({ id, email: emailOf(id) })))
    .onConflictDoNothing();
  await db
    .insert(groups)
    .values({
      id: groupId,
      name: "Invite Test",
      slug: `invite-test-${randomUUID().slice(0, 8)}`,
      createdByUserId: inviter,
    })
    .onConflictDoNothing();
  await db
    .insert(memberships)
    .values({ groupId, userId: inviter, role: "owner" })
    .onConflictDoNothing();
}

const user = (id: string) => ({ id, email: emailOf(id) });

void test("accepting creates the membership the CLI looks for", async () => {
  await seed();
  const { token } = await inviteToGroup(
    db,
    inviter,
    groupId,
    emailOf(invitee),
    "builder",
  );

  const res = await acceptInvitation(db, user(invitee), token);
  assert.equal(res.ok, true);

  // This row is exactly what `atlas group use <slug>` resolves through.
  const m = await db.query.memberships.findFirst({
    where: eq(memberships.userId, invitee),
  });
  assert.equal(m?.groupId, groupId);
  assert.equal(m?.role, "builder");
});

void test("a second click lands in the group instead of erroring", async () => {
  await seed();
  const { token } = await inviteToGroup(
    db,
    inviter,
    groupId,
    emailOf(invitee),
    "builder",
  );
  await acceptInvitation(db, user(invitee), token);
  const again = await acceptInvitation(db, user(invitee), token);
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.alreadyMember, true);
});

void test("a forwarded invite does not admit a different account", async () => {
  await seed();
  const { token } = await inviteToGroup(
    db,
    inviter,
    groupId,
    emailOf(invitee),
    "builder",
  );

  const res = await acceptInvitation(db, user(other), token);
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.reason, "wrong_email");

  const leaked = await db.query.memberships.findFirst({
    where: eq(memberships.userId, other),
  });
  assert.equal(leaked, undefined);
});

void test("an expired invite is refused and says so", async () => {
  await seed();
  const { token, invitationId } = await inviteToGroup(
    db,
    inviter,
    groupId,
    emailOf(invitee),
    "builder",
  );
  await db
    .update(invitations)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(invitations.id, invitationId));

  const res = await acceptInvitation(db, user(invitee), token);
  assert.equal(!res.ok && res.reason, "expired");
});

void test("a garbage token is not found rather than throwing", async () => {
  await seed();
  const res = await acceptInvitation(db, user(invitee), "atlas_inv_nope");
  assert.equal(!res.ok && res.reason, "not_found");
});

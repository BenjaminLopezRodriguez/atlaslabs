import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import type { db as database } from "@/server/db";
import {
  groups,
  invitations,
  memberships,
  workspaces,
} from "@/server/db/schema";

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invite an e-mail into a group. Caller must already be authorized
 * (owner). Returns the one-time plaintext token.
 */
export async function inviteToGroup(
  db: typeof database,
  inviterId: string,
  groupId: string,
  email: string,
  role: "owner" | "builder" | "operator" | "viewer",
) {
  const token = `atlas_inv_${randomBytes(24).toString("base64url")}`;
  const [inv] = await db
    .insert(invitations)
    .values({
      groupId,
      email: email.toLowerCase(),
      role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedByUserId: inviterId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();
  await audit({
    action: "member.invite",
    groupId,
    userId: inviterId,
    detail: { type: "invitation", id: inv!.id, email: inv!.email, role },
  });
  return { invitationId: inv!.id, token, expiresAt: inv!.expiresAt };
}

/** Create a group with its owner membership and group workspace. */
export async function createGroup(
  db: typeof database,
  userId: string,
  name: string,
  via: "web" | "cli" = "web",
) {
  const base = slugify(name) || "group";
  const exists = await db.query.groups.findFirst({
    where: eq(groups.slug, base),
  });
  const slug = exists ? `${base}-${randomBytes(3).toString("hex")}` : base;

  const group = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(groups)
      .values({ name, slug, createdByUserId: userId })
      .returning();
    await tx
      .insert(memberships)
      .values({ groupId: g!.id, userId, role: "owner" });
    await tx.insert(workspaces).values({ name, groupId: g!.id });
    return g!;
  });

  await audit({
    action: "group.create",
    groupId: group.id,
    userId,
    detail: { type: "group", id: group.id, name: group.name, via },
  });
  return group;
}

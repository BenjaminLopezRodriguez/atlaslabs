import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { audit } from "@/server/audit";
import type { db as database } from "@/server/db";
import { groups, invitations, memberships } from "@/server/db/schema";

type Db = typeof database;

/**
 * Why an invite could not be accepted. The caller renders these; they are
 * deliberately distinguishable so the page can say "this expired" rather than
 * the useless "invalid link".
 */
export type AcceptFailure =
  | "not_found"
  | "revoked"
  | "expired"
  | "wrong_email"
  | "already_accepted";

export type AcceptResult =
  | { ok: true; groupId: string; groupSlug: string; alreadyMember: boolean }
  | { ok: false; reason: AcceptFailure };

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Consume an invitation token and make the user a member of its group.
 *
 * The token is looked up by hash — the plaintext exists only in the email, so a
 * database read cannot mint one. Acceptance is bound to the invited address:
 * an invite is issued *to an email*, and honouring it for whoever happens to be
 * signed in would turn a forwarded email into a way into someone's group.
 *
 * Idempotent by design. People click the link in the email twice, and the
 * second click must land them in the group rather than on an error page, so an
 * existing membership is success — but it never silently upgrades a role the
 * group already set.
 */
export async function acceptInvitation(
  db: Db,
  user: { id: string; email: string },
  token: string,
): Promise<AcceptResult> {
  const inv = await db.query.invitations.findFirst({
    where: eq(invitations.tokenHash, hashInviteToken(token)),
  });
  if (!inv) return { ok: false, reason: "not_found" };
  if (inv.revokedAt) return { ok: false, reason: "revoked" };
  if (inv.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, reason: "wrong_email" };
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, inv.groupId),
  });
  if (!group) return { ok: false, reason: "not_found" };

  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.groupId, inv.groupId),
      eq(memberships.userId, user.id),
    ),
  });

  if (existing) {
    // Already in. Mark the invite spent so it stops being a live credential,
    // but leave the role alone — the group may have changed it deliberately.
    if (!inv.acceptedAt) {
      await db
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, inv.id));
    }
    return {
      ok: true,
      groupId: inv.groupId,
      groupSlug: group.slug,
      alreadyMember: true,
    };
  }

  if (inv.acceptedAt) return { ok: false, reason: "already_accepted" };

  await db.transaction(async (tx) => {
    /*
     * Re-check acceptedAt inside the write. Two tabs opening the same link at
     * once would otherwise both pass the read above; the guard makes the second
     * one a no-op instead of a duplicate membership insert.
     */
    const claimed = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!claimed.length) return;

    await tx
      .insert(memberships)
      .values({ groupId: inv.groupId, userId: user.id, role: inv.role })
      .onConflictDoNothing();
  });

  await audit({
    action: "member.accept",
    groupId: inv.groupId,
    userId: user.id,
    detail: { type: "invitation", id: inv.id, email: inv.email, role: inv.role },
  });

  return {
    ok: true,
    groupId: inv.groupId,
    groupSlug: group.slug,
    alreadyMember: false,
  };
}

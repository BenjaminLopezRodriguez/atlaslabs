import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { db as database } from "@/server/db";
import {
  memberships,
  specialists,
  workspaces,
  type MembershipRole,
} from "@/server/db/schema";

type Db = typeof database;

/** Role power ordering. Higher includes everything below it. */
const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 0,
  operator: 1,
  builder: 2,
  owner: 3,
};

export function roleAtLeast(role: MembershipRole, min: MembershipRole) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Central group authorization. Every group-scoped read/write goes through
 * here — group ownership is a hard data boundary; UI hiding is not
 * authorization. Throws FORBIDDEN on non-membership or insufficient role.
 */
export async function requireGroupRole(
  db: Db,
  userId: string,
  groupId: string,
  min: MembershipRole,
): Promise<MembershipRole> {
  const m = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.groupId, groupId),
      eq(memberships.userId, userId),
    ),
  });
  if (!m || !roleAtLeast(m.role, min)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
  }
  return m.role;
}

/**
 * Resolve a workspace and verify access. Personal workspaces admit only
 * their owner; group workspaces route through requireGroupRole.
 */
export async function requireWorkspaceAccess(
  db: Db,
  userId: string,
  workspaceId: string,
  min: MembershipRole,
) {
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!ws) throw new TRPCError({ code: "NOT_FOUND" });
  if (ws.groupId) {
    const role = await requireGroupRole(db, userId, ws.groupId, min);
    return { workspace: ws, role };
  }
  if (ws.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
  }
  return { workspace: ws, role: "owner" as const };
}

/** Resolve a specialist and verify workspace access to it. */
export async function requireSpecialistAccess(
  db: Db,
  userId: string,
  specialistId: string,
  min: MembershipRole,
) {
  const sp = await db.query.specialists.findFirst({
    where: eq(specialists.id, specialistId),
  });
  if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
  const { workspace, role } = await requireWorkspaceAccess(
    db,
    userId,
    sp.workspaceId,
    min,
  );
  return { specialist: sp, workspace, role };
}

/** The caller's personal workspace, created on demand. */
export async function getPersonalWorkspace(db: Db, userId: string) {
  const existing = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.userId, userId), isNull(workspaces.groupId)),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(workspaces)
    .values({ name: "Personal", userId })
    .returning();
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return created;
}

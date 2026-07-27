import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { requireWorkspaceAccess } from "@/server/authz";
import type { db as database } from "@/server/db";
import { machines, type MembershipRole } from "@/server/db/schema";

type Db = typeof database;

export type Machine = typeof machines.$inferSelect;

/**
 * Resolve a machine the caller may act on, or null.
 *
 * Ownership routes through the existing `requireWorkspaceAccess` — personal
 * workspaces admit only their owner, group workspaces go through membership
 * roles. There is deliberately no second ownership model here.
 *
 * Not-found and not-permitted both return null so callers emit 404 either way:
 * whether a machine exists must not be observable across tenants.
 */
export async function reachableMachine(
  db: Db,
  userId: string,
  machineId: string,
  min: MembershipRole = "operator",
): Promise<Machine | null> {
  const machine = await db.query.machines.findFirst({
    where: eq(machines.id, machineId),
  });
  if (!machine) return null;
  return (await permitted(db, userId, machine, min)) ? machine : null;
}

/** Same, resolving by slug within a tenancy workspace. */
export async function reachableMachineBySlug(
  db: Db,
  userId: string,
  workspaceId: string,
  slug: string,
  min: MembershipRole = "operator",
): Promise<Machine | null> {
  const machine = await db.query.machines.findFirst({
    where: and(
      eq(machines.workspaceId, workspaceId),
      eq(machines.slug, slug),
    ),
  });
  if (!machine) return null;
  return (await permitted(db, userId, machine, min)) ? machine : null;
}

async function permitted(
  db: Db,
  userId: string,
  machine: Machine,
  min: MembershipRole,
): Promise<boolean> {
  try {
    await requireWorkspaceAccess(db, userId, machine.workspaceId, min);
    return true;
  } catch (err) {
    // FORBIDDEN/NOT_FOUND both collapse to "you cannot see this"
    if (err instanceof TRPCError) return false;
    throw err;
  }
}

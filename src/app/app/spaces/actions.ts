"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { inviteToGroup } from "@/server/groups";
import { acceptUrl, sendInviteEmail } from "@/server/invites/notify";
import { eq } from "drizzle-orm";
import {
  groups,
  machines,
  workspaces,
  type MembershipRole,
} from "@/server/db/schema";
import { requireGroupRole } from "@/server/authz";
import {
  createMachine,
  getMachine,
  stopMachine,
  MachineConflictError,
} from "@/server/machines/store";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function caller() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Stop a space. On the Modal backend this is terminal — the filesystem goes
 * with it — so the UI that calls this says so before it does.
 */
export async function stopSpace(machineId: string): Promise<ActionResult> {
  const user = await caller();
  const machine = await getMachine(user.id, machineId);
  if (!machine) return { ok: false, error: "Space not found." };
  try {
    await stopMachine(machine);
  } catch (err) {
    if (err instanceof MachineConflictError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/app/spaces");
  return { ok: true, message: `Stopped ${machine.slug}.` };
}

/**
 * Provision a fresh space on the same slug.
 *
 * Deliberately not called "restart": nothing is restored. The old machine's
 * disk is gone, and `createMachine` is idempotent per (workspace, slug), so
 * this only succeeds once the previous one is actually terminated.
 */
export async function recreateSpace(machineId: string): Promise<ActionResult> {
  const user = await caller();
  const old = await getMachine(user.id, machineId);
  if (!old) return { ok: false, error: "Space not found." };
  if (!old.terminatedAt) {
    return { ok: false, error: "Stop it first — recreating replaces the machine." };
  }
  try {
    const fresh = await createMachine({
      userId: user.id,
      workspaceId: old.workspaceId,
      slug: old.slug,
      name: old.name,
      templateId: old.templateId,
      region: old.region,
    });
    revalidatePath("/app/spaces");
    return { ok: true, message: `Recreated ${fresh.slug} — empty filesystem.` };
  } catch (err) {
    if (err instanceof MachineConflictError) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * Forget a stopped space. Only the row goes — the machine itself is already
 * gone. Refuses while it is still running so "delete" can never be a silent
 * way to destroy a live filesystem; stop it first, and read the warning there.
 */
export async function deleteSpace(machineId: string): Promise<ActionResult> {
  const user = await caller();
  const machine = await getMachine(user.id, machineId);
  if (!machine) return { ok: false, error: "Space not found." };
  if (!machine.terminatedAt) {
    return { ok: false, error: "Stop it before deleting." };
  }
  await db.delete(machines).where(eq(machines.id, machine.id));
  revalidatePath("/app/spaces");
  return { ok: true, message: `Deleted ${machine.slug}.` };
}

/**
 * Invite someone to the group that owns this space — which is what sharing a
 * space means today. A personal space has no group to add them to, so this
 * refuses rather than silently doing nothing.
 */
export async function shareSpace(
  machineId: string,
  email: string,
  role: MembershipRole,
): Promise<ActionResult> {
  const user = await caller();
  const machine = await getMachine(user.id, machineId);
  if (!machine) return { ok: false, error: "Space not found." };

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, machine.workspaceId),
  });
  if (!ws?.groupId) {
    return {
      ok: false,
      error:
        "This is a personal space. Create a group first (`atlas group create`) to share it.",
    };
  }

  // Only an owner may widen who can reach the group's machines.
  try {
    await requireGroupRole(db, user.id, ws.groupId, "owner");
  } catch {
    return { ok: false, error: "Only a group owner can invite people." };
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, ws.groupId),
  });
  const result = await inviteToGroup(db, user.id, ws.groupId, email, role);

  const { delivered, error } = await sendInviteEmail({
    to: email,
    token: result.token,
    groupName: group?.name ?? "Atlas",
    groupSlug: group?.slug ?? "",
    role,
    invitedBy: user.email,
    machine: { slug: machine.slug, id: machine.id },
  });

  revalidatePath("/app/spaces");
  return delivered
    ? { ok: true, message: `Invite emailed to ${email}.` }
    : {
        ok: true,
        message: `Could not email${error ? ` (${error})` : ""}. Send this link: ${acceptUrl(result.token)}`,
      };
}

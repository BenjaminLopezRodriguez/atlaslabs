import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireGroupRole } from "@/server/authz";
import { db } from "@/server/db";
import { groups } from "@/server/db/schema";
import { inviteToGroup } from "@/server/groups";
import { acceptUrl, sendInviteEmail } from "@/server/invites/notify";
import { getMachineBySlug } from "@/server/machines/store";

import { requireCli, toHttpError, unauthorized } from "../helpers";

const bodySchema = z.object({
  groupId: z.string(),
  email: z.string().email(),
  role: z.enum(["owner", "builder", "operator", "viewer"]),
  /** Optional machine to name in the invite, resolved in the caller's scope. */
  machineSlug: z.string().max(63).optional(),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const { groupId, email, role, machineSlug } = parsed.data;
  try {
    await requireGroupRole(db, user.id, groupId, "owner");

    /*
     * Resolved as the inviter, before the invitation exists: naming a machine
     * you cannot reach must fail the request, not leak a slug into an email.
     */
    const machine = machineSlug
      ? await getMachineBySlug(user.id, machineSlug)
      : null;
    if (machineSlug && !machine) {
      return Response.json({ error: "machine_not_found" }, { status: 404 });
    }

    const group = await db.query.groups.findFirst({
      where: eq(groups.id, groupId),
    });

    const result = await inviteToGroup(db, user.id, groupId, email, role);

    // Delivery is best-effort: the token above is already valid and shareable.
    const { delivered, error } = await sendInviteEmail({
      to: email,
      token: result.token,
      groupName: group?.name ?? "Atlas",
      groupSlug: group?.slug ?? "",
      role,
      invitedBy: user.email,
      machine: machine ? { slug: machine.slug, id: machine.id } : null,
    });

    return Response.json({
      ...result,
      acceptUrl: acceptUrl(result.token),
      machine: machine ? { id: machine.id, slug: machine.slug } : null,
      notified: delivered,
      notifyError: error ?? null,
    });
  } catch (err) {
    return toHttpError(err);
  }
}

import { z } from "zod";

import { requireGroupRole } from "@/server/authz";
import { db } from "@/server/db";
import { inviteToGroup } from "@/server/groups";

import { requireCli, toHttpError, unauthorized } from "../helpers";

const bodySchema = z.object({
  groupId: z.string(),
  email: z.string().email(),
  role: z.enum(["owner", "builder", "operator", "viewer"]),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await requireGroupRole(db, user.id, parsed.data.groupId, "owner");
    const result = await inviteToGroup(
      db,
      user.id,
      parsed.data.groupId,
      parsed.data.email,
      parsed.data.role,
    );
    return Response.json(result);
  } catch (err) {
    return toHttpError(err);
  }
}

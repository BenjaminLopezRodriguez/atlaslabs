import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { specialists } from "@/server/db/schema";
import { deploySpecialist } from "@/server/deployments";

import { requireCli, toHttpError, unauthorized } from "../../helpers";

const bodySchema = z.object({ specialistId: z.string() });

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const sp = await db.query.specialists.findFirst({
      where: eq(specialists.id, parsed.data.specialistId),
    });
    if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
    const { workspace } = await requireWorkspaceAccess(
      db,
      user.id,
      sp.workspaceId,
      "builder",
    );
    const deployment = await deploySpecialist(sp, workspace.groupId, user.id);
    return Response.json({ deployment });
  } catch (err) {
    if (err instanceof Error && err.message.includes("evaluation")) {
      return Response.json({ error: err.message }, { status: 412 });
    }
    return toHttpError(err);
  }
}

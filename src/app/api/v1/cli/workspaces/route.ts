import { eq, inArray } from "drizzle-orm";

import { getPersonalWorkspace } from "@/server/authz";
import { db } from "@/server/db";
import { memberships, workspaces } from "@/server/db/schema";

import { requireCli, toHttpError, unauthorized } from "../helpers";

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const personal = await getPersonalWorkspace(db, user.id);
    const groupIds = (
      await db.query.memberships.findMany({
        where: eq(memberships.userId, user.id),
        columns: { groupId: true },
      })
    ).map((m) => m.groupId);
    const groupWorkspaces = groupIds.length
      ? await db.query.workspaces.findMany({
          where: inArray(workspaces.groupId, groupIds),
          with: { group: { columns: { id: true, name: true, slug: true } } },
        })
      : [];
    return Response.json({ personal, groupWorkspaces });
  } catch (err) {
    return toHttpError(err);
  }
}

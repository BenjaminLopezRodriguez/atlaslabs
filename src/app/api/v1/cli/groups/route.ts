import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { groups, memberships } from "@/server/db/schema";
import { createGroup } from "@/server/groups";

import { requireCli, toHttpError, unauthorized } from "../helpers";

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      slug: groups.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(groups, eq(memberships.groupId, groups.id))
    .where(eq(memberships.userId, user.id));
  return Response.json({ groups: rows });
}

const createSchema = z.object({ name: z.string().min(1).max(256) });

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const group = await createGroup(db, user.id, parsed.data.name, "cli");
    return Response.json({ group });
  } catch (err) {
    return toHttpError(err);
  }
}

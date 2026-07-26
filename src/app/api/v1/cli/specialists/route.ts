import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { specialists } from "@/server/db/schema";
import { createSpecialistFromPrompt } from "@/server/specialist/create";

import { requireCli, toHttpError, unauthorized } from "../helpers";

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return Response.json({ error: "workspaceId required" }, { status: 400 });
  }
  try {
    await requireWorkspaceAccess(db, user.id, workspaceId, "viewer");
    const rows = await db.query.specialists.findMany({
      where: eq(specialists.workspaceId, workspaceId),
      columns: {
        id: true,
        name: true,
        slug: true,
        purpose: true,
        state: true,
        createdAt: true,
      },
    });
    return Response.json({ specialists: rows });
  } catch (err) {
    return toHttpError(err);
  }
}

const createSchema = z.object({
  workspaceId: z.string(),
  prompt: z.string().min(1).max(10_000),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const { workspace } = await requireWorkspaceAccess(
      db,
      user.id,
      parsed.data.workspaceId,
      "builder",
    );
    const created = await createSpecialistFromPrompt(
      db,
      user.id,
      workspace,
      parsed.data.prompt,
    );
    return Response.json(created);
  } catch (err) {
    return toHttpError(err);
  }
}

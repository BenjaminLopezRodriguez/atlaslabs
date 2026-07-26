import { eq } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/server/audit";
import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { sources } from "@/server/db/schema";

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
    const rows = await db.query.sources.findMany({
      where: eq(sources.workspaceId, workspaceId),
      columns: {
        id: true,
        kind: true,
        name: true,
        origin: true,
        status: true,
        createdAt: true,
      },
    });
    return Response.json({ sources: rows });
  } catch (err) {
    return toHttpError(err);
  }
}

const removeSchema = z.object({ sourceId: z.string() });

/** Revoke a source (kept for provenance; downstream use is invalidated). */
export async function DELETE(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const source = await db.query.sources.findFirst({
      where: eq(sources.id, parsed.data.sourceId),
    });
    if (!source) return Response.json({ error: "not_found" }, { status: 404 });
    const { workspace } = await requireWorkspaceAccess(
      db,
      user.id,
      source.workspaceId,
      "builder",
    );
    await db
      .update(sources)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(sources.id, source.id));
    await audit({
      action: "source.revoke",
      groupId: workspace.groupId,
      userId: user.id,
      detail: { type: "source", id: source.id, origin: source.origin },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return toHttpError(err);
  }
}

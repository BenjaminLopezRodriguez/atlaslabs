import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { serviceKeys, specialists } from "@/server/db/schema";
import { createServiceKey, revokeServiceKey } from "@/server/service-keys";

import { requireCli, toHttpError, unauthorized } from "../helpers";

const scopeSchema = z.enum([
  "specialist:invoke",
  "specialist:read",
  "runs:read",
  "artifacts:read",
  "events:subscribe",
]);

async function specialistFor(
  userId: string,
  specialistId: string,
  min: "viewer" | "builder",
) {
  const sp = await db.query.specialists.findFirst({
    where: eq(specialists.id, specialistId),
  });
  if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
  const { workspace } = await requireWorkspaceAccess(
    db,
    userId,
    sp.workspaceId,
    min,
  );
  return { sp, workspace };
}

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const specialistId = new URL(req.url).searchParams.get("specialistId");
  if (!specialistId) {
    return Response.json({ error: "specialistId required" }, { status: 400 });
  }
  try {
    await specialistFor(user.id, specialistId, "viewer");
    const keys = await db.query.serviceKeys.findMany({
      where: and(
        eq(serviceKeys.specialistId, specialistId),
        isNull(serviceKeys.revokedAt),
      ),
      orderBy: desc(serviceKeys.createdAt),
      columns: {
        id: true,
        label: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return Response.json({ keys });
  } catch (err) {
    return toHttpError(err);
  }
}

const createSchema = z.object({
  specialistId: z.string(),
  label: z.string().min(1).max(128).default("CLI key"),
  scopes: z
    .array(scopeSchema)
    .min(1)
    .default([
      "specialist:invoke",
      "runs:read",
      "artifacts:read",
      "events:subscribe",
    ]),
  rateLimit: z.number().int().min(1).max(10_000).default(60),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const { workspace } = await specialistFor(
      user.id,
      parsed.data.specialistId,
      "builder",
    );
    const key = await createServiceKey({
      workspace,
      specialistId: parsed.data.specialistId,
      label: parsed.data.label,
      scopes: parsed.data.scopes,
      rateLimit: parsed.data.rateLimit,
      createdByUserId: user.id,
    });
    return Response.json(key);
  } catch (err) {
    return toHttpError(err);
  }
}

const revokeSchema = z.object({ keyId: z.string() });

export async function DELETE(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const key = await db.query.serviceKeys.findFirst({
      where: eq(serviceKeys.id, parsed.data.keyId),
    });
    if (!key) return Response.json({ error: "not_found" }, { status: 404 });
    const { workspace } = await specialistFor(
      user.id,
      key.specialistId,
      "builder",
    );
    await revokeServiceKey(key.id, workspace.groupId, user.id);
    return Response.json({ ok: true });
  } catch (err) {
    return toHttpError(err);
  }
}

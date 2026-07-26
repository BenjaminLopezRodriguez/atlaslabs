import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { cliTokens, users } from "@/server/db/schema";

export const sha256 = (s: string) =>
  createHash("sha256").update(s).digest("hex");

export function mintToken(prefix: "atlas_pat" | "atlas_sk") {
  const secret = `${prefix}_${randomBytes(24).toString("base64url")}`;
  return {
    secret,
    hash: sha256(secret),
    prefix: secret.slice(0, 14),
  };
}

/**
 * Authenticate a CLI request via `Authorization: Bearer atlas_pat_…`.
 * Returns the user row or null. Touches lastUsedAt (fire-and-forget).
 */
export async function cliUserFromRequest(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token?.startsWith("atlas_pat_")) return null;

  const row = await db.query.cliTokens.findFirst({
    where: eq(cliTokens.tokenHash, sha256(token)),
  });
  if (!row || row.revokedAt) return null;

  db.update(cliTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(cliTokens.id, row.id))
    .catch(() => undefined);

  return db.query.users.findFirst({ where: eq(users.id, row.userId) }) ?? null;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

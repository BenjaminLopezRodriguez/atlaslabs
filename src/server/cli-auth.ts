import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { cliTokens, users } from "@/server/db/schema";
import { touchDevice } from "@/server/devices/store";

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
 * The authenticated caller: the user row plus the device the token was minted
 * for. `deviceId` is null only for tokens predating device tracking.
 */
export type CliPrincipal = typeof users.$inferSelect & {
  deviceId: string | null;
};

/**
 * Authenticate a CLI request via `Authorization: Bearer atlas_pat_…`.
 * Returns the caller or null. Touches lastUsedAt (fire-and-forget).
 *
 * Device identity comes from the token row found here — there is deliberately
 * no code path that reads a device id from a request header or body.
 */
export async function cliUserFromRequest(
  req: Request,
): Promise<CliPrincipal | null> {
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

  if (row.deviceId) touchDevice(row.deviceId);

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  });
  return user ? { ...user, deviceId: row.deviceId } : null;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

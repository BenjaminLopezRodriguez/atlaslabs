import { eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import { mintToken, sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import {
  serviceKeys,
  type ServiceKeyScope,
  type workspaces,
} from "@/server/db/schema";

export type VerifiedKey = typeof serviceKeys.$inferSelect;

/**
 * Verify a `Bearer atlas_sk_…` service key: existence, revocation, expiry,
 * required scope. Returns null on any failure (deny by default).
 */
export async function verifyServiceKey(
  req: Request,
  scope: ServiceKeyScope,
): Promise<VerifiedKey | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token?.startsWith("atlas_sk_")) return null;

  const key = await db.query.serviceKeys.findFirst({
    where: eq(serviceKeys.keyHash, sha256(token)),
  });
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  if (!key.scopes.includes(scope)) return null;

  db.update(serviceKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(serviceKeys.id, key.id))
    .catch(() => undefined);
  return key;
}

/**
 * Fixed-window per-key rate limit.
 * ponytail: in-memory — resets on restart, per-instance in k8s; move to
 * Redis (REDIS_URL is already provisioned) when replicas > 1 matters.
 */
const windows = new Map<string, { start: number; count: number }>();

export function rateLimitOk(key: VerifiedKey): boolean {
  const now = Date.now();
  const w = windows.get(key.id);
  if (!w || now - w.start > 60_000) {
    windows.set(key.id, { start: now, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= key.rateLimit;
}

export function apiError(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Mint a scoped service key. Plaintext returned exactly once. */
export async function createServiceKey(opts: {
  workspace: typeof workspaces.$inferSelect;
  specialistId: string;
  label: string;
  scopes: ServiceKeyScope[];
  rateLimit?: number;
  expiresAt?: Date;
  createdByUserId: string;
}) {
  const { secret, hash, prefix } = mintToken("atlas_sk");
  const [key] = await db
    .insert(serviceKeys)
    .values({
      groupId: opts.workspace.groupId,
      userId: opts.workspace.groupId ? null : opts.createdByUserId,
      specialistId: opts.specialistId,
      label: opts.label,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: opts.scopes,
      rateLimit: opts.rateLimit ?? 60,
      expiresAt: opts.expiresAt,
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  await audit({
    action: "service_key.create",
    groupId: opts.workspace.groupId,
    userId: opts.createdByUserId,
    detail: {
      type: "service_key",
      id: key!.id,
      specialistId: opts.specialistId,
      scopes: opts.scopes,
    },
  });
  return { id: key!.id, secret, prefix, scopes: key!.scopes };
}

/** Immediate revocation — verification re-checks revokedAt on every call. */
export async function revokeServiceKey(
  keyId: string,
  groupId: string | null,
  userId: string,
) {
  await db
    .update(serviceKeys)
    .set({ revokedAt: new Date() })
    .where(eq(serviceKeys.id, keyId));
  await audit({
    action: "service_key.revoke",
    groupId,
    userId,
    detail: { type: "service_key", id: keyId },
  });
}

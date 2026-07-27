import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db as database } from "@/server/db";
import { deployTokens } from "@/server/db/schema";
import type { Machine } from "@/server/machines/authz";

/**
 * Deploy tokens — how a running deployment talks back to Atlas without a login.
 *
 * Three properties make this safe enough to hand to user code:
 *
 * 1. Machine-scoped. The token names one machine and one workspace. There is
 *    no code path that turns it into a user session, and nothing it can reach
 *    outside that machine's project.
 * 2. Two capabilities only — report a live URL, post an update. It cannot read
 *    files, run commands, list spaces, or mint anything.
 * 3. Rotated on every deploy and revoked when the space stops, so a token
 *    scraped from an old image stops working at the next push.
 *
 * The prefix `atlas_dt_` is distinct from `atlas_pat_` (user) and `atlas_sk_`
 * (service key) so no verifier ever accepts the wrong kind by accident.
 */

type Db = typeof database;

const PREFIX = "atlas_dt_";

/** A deployment that never checks in is not worth keeping a live credential for. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Per token, for the lifetime of the token. Bounded because this is user code. */
export const MAX_NOTIFICATIONS = 200;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type DeployToken = typeof deployTokens.$inferSelect;

/**
 * Mint a token for a machine, revoking its predecessors.
 *
 * Rotation is the point: the previous deployment's copy stops working the
 * moment a new one ships, which bounds how long a leaked image is useful.
 * The plaintext is returned exactly once and never stored.
 */
export async function mintDeployToken(
  opts: {
    machine: Machine;
    label?: string;
    createdByUserId: string;
    ttlMs?: number;
  },
  db: Db = database,
): Promise<{ token: string; id: string; expiresAt: Date }> {
  await revokeDeployTokens(opts.machine.id, db);

  const secret = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS));

  const [row] = await db
    .insert(deployTokens)
    .values({
      machineId: opts.machine.id,
      workspaceId: opts.machine.workspaceId,
      tokenHash: sha256(secret),
      tokenPrefix: secret.slice(0, 16),
      label: opts.label ?? "Railway deployment",
      createdByUserId: opts.createdByUserId,
      expiresAt,
    })
    .returning();

  return { token: secret, id: row!.id, expiresAt };
}

export async function revokeDeployTokens(
  machineId: string,
  db: Db = database,
): Promise<void> {
  await db
    .update(deployTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(deployTokens.machineId, machineId),
        isNull(deployTokens.revokedAt),
      ),
    );
}

/**
 * Authenticate `Authorization: Bearer atlas_dt_…`.
 *
 * Deny by default: every failure — wrong prefix, unknown hash, revoked,
 * expired — returns null with no distinction, so a caller probing the endpoint
 * learns nothing about which tokens exist.
 */
export async function verifyDeployToken(
  req: Request,
  db: Db = database,
): Promise<DeployToken | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token?.startsWith(PREFIX)) return null;

  const row = await db.query.deployTokens.findFirst({
    where: eq(deployTokens.tokenHash, sha256(token)),
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  db.update(deployTokens)
    .set({ lastSeenAt: new Date() })
    .where(eq(deployTokens.id, row.id))
    .catch(() => undefined);

  return row;
}

/** Record the URL the deployment says it is serving on. */
export async function recordLiveUrl(
  tokenId: string,
  liveUrl: string,
  db: Db = database,
): Promise<void> {
  await db
    .update(deployTokens)
    .set({ liveUrl, lastSeenAt: new Date() })
    .where(eq(deployTokens.id, tokenId));
}

/**
 * Claim one notification against the token's budget.
 *
 * Counted in the database rather than in memory: this is the quota that stops
 * a crash-looping container from emailing a team a thousand times, and it has
 * to survive a redeploy of Atlas itself.
 */
export async function claimNotification(
  token: DeployToken,
  db: Db = database,
): Promise<boolean> {
  if (token.notifyCount >= MAX_NOTIFICATIONS) return false;
  const [updated] = await db
    .update(deployTokens)
    .set({ notifyCount: token.notifyCount + 1 })
    .where(
      and(
        eq(deployTokens.id, token.id),
        // Compare-and-set: two containers racing cannot both take the last slot.
        eq(deployTokens.notifyCount, token.notifyCount),
      ),
    )
    .returning({ id: deployTokens.id });
  return Boolean(updated);
}

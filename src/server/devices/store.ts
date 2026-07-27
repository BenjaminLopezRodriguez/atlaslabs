import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { cliTokens, devices, type DeviceKind } from "@/server/db/schema";

export type Device = typeof devices.$inferSelect;

const DEFAULT_LABELS: Record<DeviceKind, string> = {
  cli: "Atlas CLI",
  browser: "Atlas Browser",
  web: "Web",
  ios: "iPhone",
  android: "Android",
  desktop: "Desktop",
};

export type ResolveDeviceInput = {
  userId: string;
  /**
   * Client-supplied stable install id. A CONTINUITY HINT, NEVER AUTHORITY.
   * Always matched scoped to `userId` — see the security note on the lookup.
   */
  installationId?: string | null;
  kind: DeviceKind;
  label?: string | null;
  platform?: string | null;
  appVersion?: string | null;
};

/**
 * Return the device this sign-in belongs to, creating one if needed.
 *
 * Called at token issuance only. The returned `id` is the authoritative device
 * identity for attribution.
 */
export async function resolveDevice(
  input: ResolveDeviceInput,
  dbc = db,
): Promise<Device> {
  const label = input.label?.trim().slice(0, 128) ?? "";
  const values = {
    userId: input.userId,
    kind: input.kind,
    label: label === "" ? DEFAULT_LABELS[input.kind] : label,
    platform: input.platform?.slice(0, 64) ?? null,
    appVersion: input.appVersion?.slice(0, 32) ?? null,
    lastSeenAt: new Date(),
  };

  const trimmedInstallation = input.installationId?.trim().slice(0, 128) ?? "";
  const installationId = trimmedInstallation === "" ? null : trimmedInstallation;

  if (installationId) {
    /*
     * SECURITY: the `userId` predicate is not optional. Matching on
     * installationId alone would let anyone who guesses or steals an install id
     * attach their session to another user's device record, which is exactly
     * the attribution forgery this whole design exists to prevent.
     *
     * Revoked devices are deliberately excluded: revoking means "sign this
     * device out", so a later sign-in earns a fresh row and the revoked one
     * stays intact for the audit rows that reference it.
     */
    const existing = await dbc.query.devices.findFirst({
      where: and(
        eq(devices.userId, input.userId),
        eq(devices.installationId, installationId),
        isNull(devices.revokedAt),
      ),
    });

    if (existing) {
      /*
       * The metadata refresh is fire-and-forget so the hot path stays a single
       * awaited read — getSessionUser() calls this on every web request. Like
       * cliTokens.lastUsedAt, last-seen is best-effort by design.
       */
      void dbc
        .update(devices)
        .set({
          lastSeenAt: values.lastSeenAt,
          platform: values.platform ?? existing.platform,
          appVersion: values.appVersion ?? existing.appVersion,
        })
        .where(eq(devices.id, existing.id))
        .catch(() => undefined);

      // an existing user-edited label is never overwritten by a client hint
      return { ...existing, lastSeenAt: values.lastSeenAt };
    }
  }

  const [created] = await dbc
    .insert(devices)
    .values({ ...values, installationId })
    .returning();
  return created!;
}

export async function listDevices(userId: string, dbc = db) {
  return dbc.query.devices.findMany({
    where: eq(devices.userId, userId),
    orderBy: [desc(devices.lastSeenAt), desc(devices.createdAt)],
  });
}

/**
 * Sign a device out: mark it revoked and kill its tokens.
 *
 * The row is never deleted — audit events reference it. `installationId` is
 * cleared so the same physical device can sign in again and earn a new row
 * without colliding on the unique index.
 *
 * Returns false when the device does not exist or is not the caller's, so
 * callers emit 404 either way and device existence does not leak.
 */
export async function revokeDevice(
  input: { userId: string; deviceId: string },
  dbc = db,
): Promise<boolean> {
  const device = await dbc.query.devices.findFirst({
    where: and(
      eq(devices.id, input.deviceId),
      eq(devices.userId, input.userId),
    ),
  });
  if (!device) return false;

  const now = new Date();

  await dbc
    .update(cliTokens)
    .set({ revokedAt: now })
    .where(
      and(eq(cliTokens.deviceId, device.id), isNull(cliTokens.revokedAt)),
    );

  if (!device.revokedAt) {
    await dbc
      .update(devices)
      .set({ revokedAt: now, installationId: null })
      .where(eq(devices.id, device.id));
  }

  return true;
}

/** Best-effort last-seen bump. Never blocks or fails a request. */
export function touchDevice(deviceId: string, dbc = db) {
  void dbc
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, deviceId))
    .catch(() => undefined);
}

import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";

import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { resolveDevice } from "@/server/devices/store";

export type SessionUser = typeof users.$inferSelect & {
  /** The device this session is attributed to. Null only if resolution failed. */
  deviceId: string | null;
};

/**
 * Session user for the current request, or null. Identity comes from the
 * WorkOS AuthKit cookie; a local `users` row is upserted on first sight so
 * every FK and authorization check binds to a row we own.
 *
 * The device is keyed on the WorkOS session id (`sid`), which AuthKit decodes
 * from the signed access token. It is therefore server-attested and cannot be
 * forged by a client — the same property the CLI path gets from its token row.
 * A new WorkOS session yields a new device row, which is correct: on the web the
 * session IS the device credential, and it keeps web and CLI separately
 * revocable.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { user, sessionId } = await withAuth();
  if (!user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const [row] = await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      name,
      image: user.profilePictureUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name, image: user.profilePictureUrl ?? null },
    })
    .returning();

  if (!row) return null;

  /*
   * Attribution must never take down the request it is attributing — the same
   * rule audit() follows. A failure here costs a device id on one request, not
   * the user's session.
   */
  let deviceId: string | null = null;
  if (sessionId) {
    try {
      const device = await resolveDevice({
        userId: row.id,
        installationId: sessionId,
        kind: "web",
        label: "Web session",
      });
      deviceId = device.id;
    } catch (err) {
      console.error("[auth] device resolution failed", err);
    }
  }

  return { ...row, deviceId };
}

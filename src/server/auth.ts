import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";

import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export type SessionUser = typeof users.$inferSelect;

/**
 * Session user for the current request, or null. Identity comes from the
 * WorkOS AuthKit cookie; a local `users` row is upserted on first sight so
 * every FK and authorization check binds to a row we own.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { user } = await withAuth();
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
  return row ?? null;
}

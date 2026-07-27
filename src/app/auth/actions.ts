"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

/**
 * Sign out, for client components that cannot declare an inline action.
 *
 * A server action rather than a GET route on purpose: ending a session from a
 * GET lets a <Link> prefetch or an <img src> log someone out.
 */
export async function signOutAction() {
  await signOut({ returnTo: "/" });
}

import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

/**
 * `?next=` lets a page bounce through sign-in and get the user back — the
 * invite link needs it, since the token is only useful once we know who is
 * clicking.
 *
 * Only a same-site absolute path is honoured. `//evil.com` and
 * `https://evil.com` are both rejected: an unchecked returnTo is an open
 * redirect, and this one is reachable straight from an email.
 */
function safeNext(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export const GET = async (req: Request) => {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const signInUrl = await getSignInUrl({ returnTo: next });
  return redirect(signInUrl);
};

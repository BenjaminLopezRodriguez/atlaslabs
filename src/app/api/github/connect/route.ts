import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/server/auth";
import { authorizeUrl, githubConfigured } from "@/server/github";

export const STATE_COOKIE = "atlas_gh_state";

/** Where GitHub sends the user back. Must match the OAuth app's callback URL. */
export function callbackUrl(req: NextRequest): string {
  return new URL("/api/github/callback", req.nextUrl.origin).toString();
}

/**
 * Start the GitHub OAuth dance.
 *
 * `state` is minted here and stashed in an httpOnly cookie so the callback can
 * prove the response belongs to a flow this browser started — without it, an
 * attacker can hand someone a callback URL that attaches *their* GitHub account
 * to the victim's Atlas user.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }
  if (!githubConfigured()) {
    return NextResponse.json(
      { error: "GitHub is not configured on this deployment." },
      { status: 501 },
    );
  }

  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/github",
    maxAge: 600,
  });

  return NextResponse.redirect(
    authorizeUrl({ state, redirectUri: callbackUrl(req) }),
  );
}

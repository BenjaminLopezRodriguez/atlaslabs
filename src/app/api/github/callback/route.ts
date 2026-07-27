import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/server/auth";
import { completeOAuth } from "@/server/github";

import { STATE_COOKIE, callbackUrl } from "../connect/route";

/** Where the user lands afterwards, with the outcome in the query string. */
function done(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/app/settings/connections", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  // Single-use whatever happens next: a replayed state is not a valid flow.
  jar.delete(STATE_COOKIE);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");

  if (denied) return done(req, { github: "denied" });
  if (!code || !state || !expected || !sameState(state, expected)) {
    return done(req, { github: "error", reason: "invalid_state" });
  }

  try {
    const { login } = await completeOAuth({
      code,
      redirectUri: callbackUrl(req),
      userId: user.id,
    });
    return done(req, { github: "connected", login });
  } catch (err) {
    return done(req, {
      github: "error",
      reason: err instanceof Error ? err.message : "exchange_failed",
    });
  }
}

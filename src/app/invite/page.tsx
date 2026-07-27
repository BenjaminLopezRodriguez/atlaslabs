import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingHeader } from "@/components/atlas/landing-header";
import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { acceptInvitation, type AcceptFailure } from "@/server/invites/accept";

export const metadata = { title: "Accept invite · Atlas" };

/**
 * The other end of the invite email.
 *
 * Signing in has to come first — an invitation is bound to an email address, so
 * there is nobody to add to the group until we know who is clicking. The token
 * rides through the sign-in redirect so the link survives the round trip.
 */
const FAILURES: Record<AcceptFailure, { title: string; detail: string }> = {
  not_found: {
    title: "This invite link is not valid",
    detail:
      "It may have been mistyped or already revoked. Ask whoever invited you to send a new one.",
  },
  revoked: {
    title: "This invite was revoked",
    detail: "Ask whoever invited you to send a new one.",
  },
  expired: {
    title: "This invite has expired",
    detail: "Invites last 7 days. Ask for a fresh link and it will work.",
  },
  wrong_email: {
    title: "This invite is for a different address",
    detail:
      "Invites are tied to the address they were sent to. Sign in with that address, or ask for an invite to the one you use.",
  },
  already_accepted: {
    title: "This invite has already been used",
    detail:
      "If that was not you, ask whoever invited you to send a new one and revoke this one.",
  },
};

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <Problem {...FAILURES.not_found} />;

  const user = await getSessionUser();
  if (!user) {
    // Come back here with the token intact once they have an identity.
    redirect(`/sign-in?next=${encodeURIComponent(`/invite?token=${token}`)}`);
  }

  const result = await acceptInvitation(db, user, token);
  if (!result.ok) return <Problem {...FAILURES[result.reason]} />;

  redirect(`/app/spaces?joined=${encodeURIComponent(result.groupSlug)}`);
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <LandingHeader />
      <main className="mm-shell max-w-md pt-24 pb-24">
        <h1 className="font-heading text-foreground text-2xl font-normal tracking-tight text-balance">
          {title}
        </h1>
        <p className="text-muted-foreground mt-3 text-[15px] leading-7">
          {detail}
        </p>
        <Link
          href="/app"
          className="text-foreground mt-6 inline-block text-[13px] underline underline-offset-4"
        >
          Go to Atlas
        </Link>
      </main>
    </>
  );
}

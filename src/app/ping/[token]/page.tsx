import type { Metadata } from "next";

import { PingReply } from "@/components/atlas/ping-reply";
import { pingByReplyToken } from "@/server/pings/store";

export const metadata: Metadata = {
  title: "Atlas — a question for you",
  robots: { index: false, follow: false },
};

/**
 * Where a reply link lands. Public by design: the token is the credential, and
 * the human answering may be on a phone that has never signed in.
 */
export default async function PingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ping = await pingByReplyToken(token);

  if (!ping) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl font-normal tracking-tight">
          This link is not valid
        </h1>
        <p className="text-muted-foreground mt-3 text-[14px] leading-7">
          It may have been mistyped, or the question it belonged to was removed.
        </p>
      </Shell>
    );
  }

  const expired = ping.status === "pending" && ping.expiresAt < new Date();

  return (
    <Shell>
      <PingReply
        token={token}
        question={ping.question}
        context={ping.context}
        status={expired ? "expired" : ping.status}
        existingAnswer={ping.answer}
        askedAt={ping.createdAt.toISOString()}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
      <div className="text-muted-foreground mb-6 font-mono text-[11px] tracking-widest uppercase">
        Atlas
      </div>
      {children}
    </main>
  );
}

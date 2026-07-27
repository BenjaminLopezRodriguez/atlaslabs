import { z } from "zod";

import { answerPing, pingByReplyToken, PingError } from "@/server/pings/store";

/**
 * Answer a ping from its reply link.
 *
 * Deliberately unauthenticated: the human clicks this from an email, possibly
 * on a phone they have never signed in on. The single-use token IS the
 * credential — it is high-entropy, stored only as a hash, scoped to one ping,
 * and refused once answered or expired.
 */

const replySchema = z.object({
  token: z.string().min(1).max(128),
  answer: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = replySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const ping = await answerPing({
      token: parsed.data.token,
      answer: parsed.data.answer,
    });
    return Response.json({
      ok: true,
      ping: { id: ping.id, status: ping.status, answeredAt: ping.answeredAt },
    });
  } catch (err) {
    if (err instanceof PingError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[ping-reply]", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/** Read the question behind a reply link, so the page can render it. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ping = await pingByReplyToken(token);

  // Same response for a bad token and a missing ping — a probe learns nothing.
  if (!ping) {
    return Response.json({ error: "invalid_link" }, { status: 404 });
  }

  return Response.json({
    ping: {
      question: ping.question,
      context: ping.context,
      status: ping.expiresAt < new Date() && ping.status === "pending"
        ? "expired"
        : ping.status,
      answer: ping.answer,
      createdAt: ping.createdAt,
      expiresAt: ping.expiresAt,
    },
  });
}

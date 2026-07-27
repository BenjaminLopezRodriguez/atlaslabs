import { randomBytes } from "node:crypto";

import { and, asc, eq, lt } from "drizzle-orm";

import { sha256 } from "@/server/cli-auth";
import { db as database } from "@/server/db";
import { pings, users, type PingStatus } from "@/server/db/schema";
import type { Machine } from "@/server/machines/authz";

import { getNotifier } from "./notify";

type Db = typeof database;

export type Ping = typeof pings.$inferSelect;

/** A question nobody answers should not block an agent forever. */
export const DEFAULT_TTL_SECONDS = 15 * 60;
export const MAX_TTL_SECONDS = 60 * 60;
const MAX_QUESTION_CHARS = 4000;

export class PingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PingError";
  }
}

function replyUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/ping/${token}`;
}

/**
 * Ask the workspace owner a question.
 *
 * Returns the pending ping plus the raw reply token, which is the only time
 * that token exists in plaintext — it goes into the notification and is never
 * stored.
 */
export async function createPing(
  input: {
    machine: Machine;
    question: string;
    context?: string | null;
    ttlSeconds?: number;
    askedByUserId?: string | null;
    askedByDeviceId?: string | null;
  },
  db: Db = database,
): Promise<{ ping: Ping; replyUrl: string; notified: boolean; notifyError?: string }> {
  const question = input.question.trim();
  if (!question) throw new PingError("A ping needs a question.");
  if (question.length > MAX_QUESTION_CHARS) {
    throw new PingError(`Question is too long (max ${MAX_QUESTION_CHARS} characters).`);
  }

  const ttl = Math.min(
    Math.max(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 30),
    MAX_TTL_SECONDS,
  );

  const token = `atlas_ping_${randomBytes(24).toString("base64url")}`;
  const url = replyUrl(token);
  const notifier = getNotifier();

  const [created] = await db
    .insert(pings)
    .values({
      machineId: input.machine.id,
      workspaceId: input.machine.workspaceId,
      question,
      context: input.context ?? null,
      channel: notifier.channel,
      replyTokenHash: sha256(token),
      askedByUserId: input.askedByUserId ?? null,
      askedByDeviceId: input.askedByDeviceId ?? null,
      expiresAt: new Date(Date.now() + ttl * 1000),
    })
    .returning();

  const ping = created!;

  // Deliver after the row exists: if the transport dies mid-send, the question
  // is already durable and answerable from its link.
  let notified = false;
  let notifyError: string | undefined;

  const owner = input.askedByUserId
    ? await db.query.users.findFirst({ where: eq(users.id, input.askedByUserId) })
    : null;

  if (owner?.email) {
    const result = await notifier.send({
      to: owner.email,
      question,
      replyUrl: url,
      machineSlug: input.machine.slug,
      context: input.context,
    });
    notified = result.delivered;
    notifyError = result.error;
  } else {
    notifyError = "no contact address on file";
  }

  await db
    .update(pings)
    .set({
      notifiedAt: notified ? new Date() : null,
      notifyError: notifyError?.slice(0, 512) ?? null,
    })
    .where(eq(pings.id, ping.id));

  return { ping, replyUrl: url, notified, notifyError };
}

/** Resolve a ping from a raw reply token, or null. Expired tokens do not resolve. */
export async function pingByReplyToken(
  token: string,
  db: Db = database,
): Promise<Ping | null> {
  if (!token.startsWith("atlas_ping_")) return null;
  const row = await db.query.pings.findFirst({
    where: eq(pings.replyTokenHash, sha256(token)),
  });
  return row ?? null;
}

/**
 * Record an answer. Single-use: a token that already answered is refused, so a
 * forwarded link cannot be used to overwrite a decision.
 */
export async function answerPing(
  input: { token: string; answer: string; answeredByUserId?: string | null },
  db: Db = database,
): Promise<Ping> {
  const ping = await pingByReplyToken(input.token, db);
  if (!ping) throw new PingError("This reply link is not valid.");
  if (ping.status === "answered") {
    throw new PingError("This ping was already answered.");
  }
  if (ping.status === "cancelled") {
    throw new PingError("This ping was cancelled.");
  }
  if (ping.expiresAt < new Date()) {
    await db
      .update(pings)
      .set({ status: "expired" })
      .where(and(eq(pings.id, ping.id), eq(pings.status, "pending")));
    throw new PingError("This ping expired before it was answered.");
  }

  const answer = input.answer.trim();
  if (!answer) throw new PingError("An answer cannot be empty.");

  const [updated] = await db
    .update(pings)
    .set({
      status: "answered",
      answer: answer.slice(0, MAX_QUESTION_CHARS),
      answeredAt: new Date(),
      answeredByUserId: input.answeredByUserId ?? null,
    })
    // the status guard makes concurrent replies race-safe: the second loses
    .where(and(eq(pings.id, ping.id), eq(pings.status, "pending")))
    .returning();

  if (!updated) throw new PingError("This ping was already answered.");
  return updated;
}

export async function getPing(id: string, db: Db = database): Promise<Ping | null> {
  const row = await db.query.pings.findFirst({ where: eq(pings.id, id) });
  if (!row) return null;
  return expireIfDue(row, db);
}

/** The message log for a machine, oldest first — what an agent reads to catch up. */
export async function listPings(
  machineId: string,
  db: Db = database,
): Promise<Ping[]> {
  const rows = await db.query.pings.findMany({
    where: eq(pings.machineId, machineId),
    orderBy: [asc(pings.createdAt)],
  });
  return Promise.all(rows.map((r) => expireIfDue(r, db)));
}

/** Lazily flip a lapsed pending ping to expired — no cron needed. */
async function expireIfDue(ping: Ping, db: Db): Promise<Ping> {
  if (ping.status !== "pending" || ping.expiresAt >= new Date()) return ping;
  const [updated] = await db
    .update(pings)
    .set({ status: "expired" })
    .where(and(eq(pings.id, ping.id), eq(pings.status, "pending")))
    .returning();
  return updated ?? { ...ping, status: "expired" as PingStatus };
}

/** Sweep lapsed pings for a machine. Cheap enough to call on read paths. */
export async function expireStalePings(machineId: string, db: Db = database) {
  await db
    .update(pings)
    .set({ status: "expired" })
    .where(
      and(
        eq(pings.machineId, machineId),
        eq(pings.status, "pending"),
        lt(pings.expiresAt, new Date()),
      ),
    );
}

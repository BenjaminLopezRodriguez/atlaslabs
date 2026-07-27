import { and, desc, eq, sql } from "drizzle-orm";

import { db as database } from "@/server/db";
import {
  memberships,
  messages,
  threads,
  users,
  workspaces,
} from "@/server/db/schema";
import {
  appOrigin,
  escapeHtml,
  isEmailConfigured,
  sendEmail,
} from "@/server/email";
import { safeHttpUrl } from "@/lib/url";
import type { Machine } from "@/server/machines/authz";

/**
 * Updates from a running deployment, delivered to everyone on the project.
 *
 * Two destinations, deliberately:
 *
 * - The thread, always. It is durable, it is where the work happened, and it
 *   works whether or not any email provider is configured.
 * - Email, best-effort. A transport failure degrades to "the update is in the
 *   thread, nobody was paged" — it never loses the update.
 *
 * Everything here is attributed to the deployment, never to a person. The text
 * comes from user code, so it is escaped for HTML and labelled with the space
 * it came from; an update must not be able to look like a message from a
 * teammate.
 */

type Db = typeof database;

/** Bounded — this is a notification, not a log sink. */
export const MAX_UPDATE_CHARS = 2_000;

export type DeployUpdate = {
  machine: Machine;
  /** Free text from the deployment. Already length-checked by the route. */
  message: string;
  /** The live URL, when the update is announcing one. */
  liveUrl?: string | null;
  kind: "ready" | "update";
};

export type DeployNotifyResult = {
  threadId: string | null;
  recipients: number;
  emailed: number;
};

/**
 * Everyone who should hear about this project.
 *
 * A personal workspace has exactly one member — its owner. A group workspace
 * resolves through memberships, which is the same boundary every other
 * group-scoped read uses; there is no second audience model here.
 */
export async function projectAudience(
  workspaceId: string,
  db: Db = database,
): Promise<{ id: string; email: string; name: string | null }[]> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) return [];

  if (workspace.groupId) {
    return db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.groupId, workspace.groupId));
  }

  if (!workspace.userId) return [];
  const owner = await db.query.users.findFirst({
    where: eq(users.id, workspace.userId),
    columns: { id: true, email: true, name: true },
  });
  return owner ? [owner] : [];
}

/** The thread an update belongs to: the most recent one bound to this space. */
async function targetThread(
  machine: Machine,
  db: Db,
): Promise<{ id: string; title: string } | null> {
  const thread = await db.query.threads.findFirst({
    where: and(
      eq(threads.machineId, machine.id),
      eq(threads.workspaceId, machine.workspaceId),
    ),
    orderBy: desc(threads.createdAt),
    columns: { id: true, title: true },
  });
  return thread ?? null;
}

export async function deliverDeployUpdate(
  input: DeployUpdate,
  db: Db = database,
): Promise<DeployNotifyResult> {
  const body = input.message.slice(0, MAX_UPDATE_CHARS).trim();
  // Checked again here, not only at the route: a stored URL predating the
  // route's check must still never be rendered as a live link.
  const liveUrl = safeHttpUrl(input.liveUrl);
  const thread = await targetThread(input.machine, db);

  if (thread) {
    await db.insert(messages).values({
      threadId: thread.id,
      seq: sql`(select coalesce(max(seq), 0) + 1 from ${messages} where ${messages.threadId} = ${thread.id})`,
      // `system`, not `assistant`: this did not come from the agent, and
      // rendering it as one would misattribute the deployment's words.
      role: "system",
      content: body,
      meta: {
        source: "deployment",
        kind: input.kind,
        machineSlug: input.machine.slug,
        liveUrl: liveUrl ?? undefined,
      },
    });
  }

  const audience = await projectAudience(input.machine.workspaceId, db);
  let emailed = 0;

  if (isEmailConfigured()) {
    const url = thread
      ? `${appOrigin()}/app/w/${input.machine.workspaceId}/t/${thread.id}`
      : `${appOrigin()}/app/spaces`;

    for (const person of audience) {
      const { delivered } = await sendEmail({
        to: person.email,
        subject:
          input.kind === "ready"
            ? `${input.machine.slug} is live`
            : `Update from ${input.machine.slug}`,
        text: plainBody(input, body, url, liveUrl),
        html: htmlBody(input, body, url, liveUrl),
      });
      if (delivered) emailed++;
    }
  }

  return { threadId: thread?.id ?? null, recipients: audience.length, emailed };
}

function plainBody(
  input: DeployUpdate,
  body: string,
  url: string,
  liveUrl: string | null,
): string {
  return [
    input.kind === "ready"
      ? `${input.machine.slug} is deployed and serving.`
      : `Update from the ${input.machine.slug} deployment:`,
    "",
    body,
    "",
    liveUrl ? `Live: ${liveUrl}` : "",
    `Thread: ${url}`,
    "",
    "Sent by the deployment itself, not by a person.",
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlBody(
  input: DeployUpdate,
  body: string,
  url: string,
  liveUrl: string | null,
): string {
  return [
    `<p style="margin:0 0 12px">`,
    input.kind === "ready"
      ? `<strong>${escapeHtml(input.machine.slug)}</strong> is deployed and serving.`
      : `Update from the <strong>${escapeHtml(input.machine.slug)}</strong> deployment:`,
    `</p>`,
    // The body is user-controlled text; it is escaped and never interpolated raw.
    `<pre style="white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;background:#f5f5f5;padding:12px;border-radius:8px;margin:0 0 12px">${escapeHtml(body)}</pre>`,
    liveUrl
      ? `<p style="margin:0 0 8px"><a href="${escapeHtml(liveUrl)}">${escapeHtml(liveUrl)}</a></p>`
      : "",
    `<p style="margin:0 0 12px"><a href="${escapeHtml(url)}">Open the thread</a></p>`,
    `<p style="margin:0;color:#666;font-size:12px">Sent by the deployment itself, not by a person.</p>`,
  ]
    .filter(Boolean)
    .join("");
}

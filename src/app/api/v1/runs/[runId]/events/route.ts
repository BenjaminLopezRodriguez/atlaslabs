import { asc, eq, gt, and } from "drizzle-orm";

import { db } from "@/server/db";
import { runEvents, runs } from "@/server/db/schema";

import { authorizeRun } from "../helpers";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Run events. JSON list by default (`?after=<seq>`), server-sent events when
 * the client asks with `Accept: text/event-stream` (spec §9).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await authorizeRun(req, runId, "events:subscribe");
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") ?? 0);

  if (req.headers.get("accept")?.includes("text/event-stream")) {
    let cursor = after;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Poll-backed SSE; swap for LISTEN/NOTIFY if event volume grows.
        for (let i = 0; i < 600; i++) {
          const rows = await db.query.runEvents.findMany({
            where: and(eq(runEvents.runId, runId), gt(runEvents.seq, cursor)),
            orderBy: asc(runEvents.seq),
          });
          for (const e of rows) {
            cursor = e.seq;
            controller.enqueue(
              encoder.encode(
                `id: ${e.seq}\nevent: ${e.kind}\ndata: ${JSON.stringify(e.payload)}\n\n`,
              ),
            );
          }
          const run = await db.query.runs.findFirst({
            where: eq(runs.id, runId),
            columns: { status: true },
          });
          if (!run || TERMINAL.has(run.status)) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  const events = await db.query.runEvents.findMany({
    where: and(eq(runEvents.runId, runId), gt(runEvents.seq, after)),
    orderBy: asc(runEvents.seq),
  });
  return Response.json({
    status: auth.run.status,
    events: events.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
  });
}

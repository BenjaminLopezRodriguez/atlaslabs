import { and, eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { runs } from "@/server/db/schema";
import { emitEvent } from "@/server/runs";

import { authorizeRun } from "../helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await authorizeRun(req, runId, "specialist:invoke");
  if ("error" in auth) return auth.error;
  const { run, key } = auth;

  if (run.status === "queued") {
    await db
      .update(runs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(runs.id, run.id), eq(runs.status, "queued")));
  }
  await emitEvent(run.id, "cancel_requested", { serviceKeyId: key.id });
  await audit({
    action: "api.run.cancel",
    groupId: key.groupId,
    serviceKeyId: key.id,
    detail: { type: "run", id: run.id },
  });
  const fresh = await db.query.runs.findFirst({
    where: eq(runs.id, run.id),
    columns: { status: true },
  });
  return Response.json({ id: run.id, status: fresh?.status });
}

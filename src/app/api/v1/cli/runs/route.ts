import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { runEvents, runs, specialists } from "@/server/db/schema";
import { startRun } from "@/server/runs";

import { requireCli, toHttpError, unauthorized } from "../helpers";

async function accessSpecialist(
  userId: string,
  specialistId: string,
  min: "viewer" | "operator",
) {
  const sp = await db.query.specialists.findFirst({
    where: eq(specialists.id, specialistId),
  });
  if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
  await requireWorkspaceAccess(db, userId, sp.workspaceId, min);
  return sp;
}

/** List runs for a specialist, or one run with events (`?runId=`). */
export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const specialistId = url.searchParams.get("specialistId");

  try {
    if (runId) {
      const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
      if (!run) return Response.json({ error: "not_found" }, { status: 404 });
      await accessSpecialist(user.id, run.specialistId, "viewer");
      const events = await db.query.runEvents.findMany({
        where: eq(runEvents.runId, run.id),
        orderBy: asc(runEvents.seq),
      });
      return Response.json({ run, events });
    }
    if (!specialistId) {
      return Response.json(
        { error: "specialistId or runId required" },
        { status: 400 },
      );
    }
    await accessSpecialist(user.id, specialistId, "viewer");
    const rows = await db.query.runs.findMany({
      where: eq(runs.specialistId, specialistId),
      orderBy: desc(runs.createdAt),
      limit: 20,
      columns: {
        id: true,
        status: true,
        createdAt: true,
        finishedAt: true,
        error: true,
      },
    });
    return Response.json({ runs: rows });
  } catch (err) {
    return toHttpError(err);
  }
}

const startSchema = z.object({
  specialistId: z.string(),
  message: z.string().min(1).max(50_000),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await accessSpecialist(user.id, parsed.data.specialistId, "operator");
    const run = await startRun({
      specialistId: parsed.data.specialistId,
      input: { message: parsed.data.message },
      startedByUserId: user.id,
    });
    return Response.json(
      { runId: run.id, status: run.status },
      { status: 202 },
    );
  } catch (err) {
    return toHttpError(err);
  }
}

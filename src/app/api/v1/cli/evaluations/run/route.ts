import { eq } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/server/audit";
import { requireSpecialistAccess } from "@/server/authz";
import { db } from "@/server/db";
import { evaluationSuites } from "@/server/db/schema";
import { runEvaluation } from "@/server/evaluations";

import { requireCli, toHttpError, unauthorized } from "../../helpers";

const bodySchema = z.object({ specialistId: z.string() });

/** Run the specialist's evaluation suite against its current version. */
export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const { specialist, workspace } = await requireSpecialistAccess(
      db,
      user.id,
      parsed.data.specialistId,
      "builder",
    );
    const suite = await db.query.evaluationSuites.findFirst({
      where: eq(evaluationSuites.specialistId, specialist.id),
    });
    if (!suite) {
      return Response.json(
        {
          error: "no_suite",
          hint: "Promote a correction to an evaluation first.",
        },
        { status: 404 },
      );
    }
    const result = await runEvaluation(specialist, suite.id, user.id);
    await audit({
      action: "evaluation.run",
      groupId: workspace.groupId,
      userId: user.id,
      deviceId: user.deviceId,
      detail: {
        type: "evaluation_run",
        id: result.id,
        status: result.status,
        passed: result.passedCases,
        failed: result.failedCases,
      },
    });
    return Response.json({ evaluationRun: result });
  } catch (err) {
    return toHttpError(err);
  }
}

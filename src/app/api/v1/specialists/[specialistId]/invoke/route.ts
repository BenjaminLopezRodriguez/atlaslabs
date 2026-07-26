import { z } from "zod";

import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { apiInvocations } from "@/server/db/schema";
import { activeDeployment } from "@/server/deployments";
import { startRun } from "@/server/runs";
import { apiError, rateLimitOk, verifyServiceKey } from "@/server/service-keys";

const bodySchema = z.object({
  input: z.record(z.unknown()),
  threadId: z.string().optional(),
  idempotencyKey: z.string().min(1).max(128),
  callbackUrl: z.string().url().optional(),
});

/** Asynchronous invocation: 202 + run id (spec §9). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ specialistId: string }> },
) {
  const { specialistId } = await params;
  const key = await verifyServiceKey(req, "specialist:invoke");
  if (!key) return apiError(401, "unauthorized");
  if (key.specialistId !== specialistId) return apiError(403, "forbidden");
  if (!rateLimitOk(key)) return apiError(429, "rate_limited");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const deployment = await activeDeployment(specialistId);
  if (!deployment) return apiError(409, "specialist_not_deployed");

  const run = await startRun({
    specialistId,
    specialistVersionId: deployment.specialistVersionId,
    input: parsed.data.input,
    idempotencyKey: parsed.data.idempotencyKey,
    serviceKeyId: key.id,
  });

  await db.insert(apiInvocations).values({
    serviceKeyId: key.id,
    runId: run.id,
    endpoint: "invoke",
    statusCode: 202,
  });
  await audit({
    action: "api.invoke",
    groupId: key.groupId,
    serviceKeyId: key.id,
    detail: { type: "run", id: run.id, specialistId },
  });

  return Response.json({ runId: run.id, status: run.status }, { status: 202 });
}

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { runs, type ServiceKeyScope } from "@/server/db/schema";
import {
  apiError,
  verifyServiceKey,
  type VerifiedKey,
} from "@/server/service-keys";

/**
 * Authorize a /v1 run request: valid key with scope, and the run must belong
 * to the key's specialist — keys never see other specialists' runs.
 */
export async function authorizeRun(
  req: Request,
  runId: string,
  scope: ServiceKeyScope,
): Promise<
  { run: typeof runs.$inferSelect; key: VerifiedKey } | { error: Response }
> {
  const key = await verifyServiceKey(req, scope);
  if (!key) return { error: apiError(401, "unauthorized") };
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (run?.specialistId !== key.specialistId) {
    return { error: apiError(404, "not_found") };
  }
  return { run, key };
}

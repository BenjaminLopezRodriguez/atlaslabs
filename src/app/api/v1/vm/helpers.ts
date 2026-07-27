import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { machines } from "@/server/db/schema";
import { verifyDeployToken, type DeployToken } from "@/server/deploy/tokens";
import type { Machine } from "@/server/machines/authz";

/**
 * The `/api/v1/vm/*` surface: what a deployed container is allowed to do.
 *
 * Deliberately tiny and separate from `/api/v1/cli/*` and `/api/v1/machines/*`.
 * Those authenticate a person; these authenticate a container running code the
 * platform generated and the user edited. Keeping them in different files with
 * different verifiers means no route can drift into accepting the wrong one.
 *
 * There is no machine id in any request body — it comes from the token, so a
 * deployment cannot post updates about a project that is not its own.
 */

export type VmPrincipal = { token: DeployToken; machine: Machine };

export async function requireVm(req: Request): Promise<VmPrincipal | null> {
  const token = await verifyDeployToken(req);
  if (!token) return null;

  const machine = await db.query.machines.findFirst({
    where: eq(machines.id, token.machineId),
  });
  // A token outliving its machine authenticates nothing.
  if (!machine || machine.terminatedAt) return null;

  return { token, machine };
}

export function vmUnauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function vmError(status: number, error: string) {
  return Response.json({ error }, { status });
}

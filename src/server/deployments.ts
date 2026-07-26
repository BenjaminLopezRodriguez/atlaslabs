import { and, desc, eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import { db } from "@/server/db";
import {
  deployments,
  evaluationRuns,
  evaluationSuites,
  specialists,
} from "@/server/db/schema";

/**
 * Deploy the specialist's current version (spec §8). Gate: the version must
 * have a passing evaluation run when the specialist has any suite — no
 * suite means nothing to gate on yet, which is allowed for drafts but
 * recorded in the audit detail.
 */
export async function deploySpecialist(
  sp: typeof specialists.$inferSelect,
  groupId: string | null,
  userId: string,
) {
  if (!sp.currentVersionId) throw new Error("Specialist has no version");

  const suite = await db.query.evaluationSuites.findFirst({
    where: eq(evaluationSuites.specialistId, sp.id),
  });
  let evaluationRunId: string | null = null;
  if (suite) {
    const passing = await db.query.evaluationRuns.findFirst({
      where: and(
        eq(evaluationRuns.suiteId, suite.id),
        eq(evaluationRuns.specialistVersionId, sp.currentVersionId),
        eq(evaluationRuns.status, "passed"),
      ),
      orderBy: desc(evaluationRuns.createdAt),
    });
    if (!passing) {
      throw new Error(
        "Current version has no passing evaluation run — run the suite first",
      );
    }
    evaluationRunId = passing.id;
  }

  const deployment = await db.transaction(async (tx) => {
    // Deprecate previous active deployment.
    await tx
      .update(deployments)
      .set({ status: "deprecated", deprecatedAt: new Date() })
      .where(
        and(
          eq(deployments.specialistId, sp.id),
          eq(deployments.status, "active"),
        ),
      );
    const [dep] = await tx
      .insert(deployments)
      .values({
        specialistId: sp.id,
        specialistVersionId: sp.currentVersionId!,
        evaluationRunId,
        deployedByUserId: userId,
      })
      .returning();
    await tx
      .update(specialists)
      .set({ state: "deployed" })
      .where(eq(specialists.id, sp.id));
    return dep!;
  });

  await audit({
    action: "specialist.deploy",
    groupId,
    userId,
    detail: {
      type: "deployment",
      id: deployment.id,
      specialistId: sp.id,
      specialistVersionId: sp.currentVersionId,
      evaluationRunId,
      gated: Boolean(suite),
    },
  });
  return deployment;
}

/** Active deployment for a specialist, or null. */
export function activeDeployment(specialistId: string) {
  return db.query.deployments.findFirst({
    where: and(
      eq(deployments.specialistId, specialistId),
      eq(deployments.status, "active"),
    ),
  });
}

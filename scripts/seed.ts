/**
 * Seed the MVP acceptance scenario (spec §16): the "Atlas Labs Engineering"
 * group with Benji (owner), Colin (builder), Elul (operator), an
 * Architecture Reviewer specialist, and one evaluation case.
 *
 * Idempotent: skips when the group already exists.
 * Run: pnpm db:seed
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  evaluationCases,
  evaluationSuites,
  groups,
  memberships,
  users,
  workspaces,
} from "@/server/db/schema";
import { createSpecialistFromPrompt } from "@/server/specialist/create";

const SEED_USERS = [
  { id: "user_seed_benji", email: "benji@atlaslabs.local", name: "Benji" },
  { id: "user_seed_colin", email: "colin@atlaslabs.local", name: "Colin" },
  { id: "user_seed_elul", email: "elul@atlaslabs.local", name: "Elul" },
] as const;

async function main() {
  const existing = await db.query.groups.findFirst({
    where: eq(groups.slug, "atlas-labs-engineering"),
  });
  if (existing) {
    console.log("Seed already present — skipping.");
    process.exit(0);
  }

  await db
    .insert(users)
    .values([...SEED_USERS])
    .onConflictDoNothing();

  const [group] = await db
    .insert(groups)
    .values({
      name: "Atlas Labs Engineering",
      slug: "atlas-labs-engineering",
      createdByUserId: "user_seed_benji",
    })
    .returning();
  await db.insert(memberships).values([
    { groupId: group!.id, userId: "user_seed_benji", role: "owner" },
    { groupId: group!.id, userId: "user_seed_colin", role: "builder" },
    { groupId: group!.id, userId: "user_seed_elul", role: "operator" },
  ]);
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Atlas Labs Engineering", groupId: group!.id })
    .returning();

  const { specialist } = await createSpecialistFromPrompt(
    db,
    "user_seed_benji",
    ws!,
    "Create a specialist that understands our architecture and reviews changes against our conventions.",
  );

  const [suite] = await db
    .insert(evaluationSuites)
    .values({
      specialistId: specialist.id,
      name: "Default",
      createdByUserId: "user_seed_colin",
    })
    .returning();
  await db.insert(evaluationCases).values({
    suiteId: suite!.id,
    name: "Flags missing review of auth changes",
    input: { message: "Review a change that edits the login flow" },
    expectation: "review login flow findings",
    critical: false,
    createdByUserId: "user_seed_colin",
  });

  console.log(
    `Seeded group ${group!.slug}, specialist ${specialist.slug}, 1 eval case.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

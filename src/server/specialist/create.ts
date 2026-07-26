import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import type { db as database } from "@/server/db";
import type { workspaces } from "@/server/db/schema";
import {
  messages,
  specialistVersions,
  specialists,
  threads,
} from "@/server/db/schema";
import { draftManifestFromPrompt, slugify } from "@/server/specialist/manifest";

/**
 * Turn a prompt into a draft specialist + version 1 + a seeded chat thread
 * (spec first-run flow steps 4–6). Caller must have verified builder access
 * to `workspace`.
 */
export async function createSpecialistFromPrompt(
  db: typeof database,
  userId: string,
  workspace: typeof workspaces.$inferSelect,
  prompt: string,
) {
  const manifest = draftManifestFromPrompt(prompt);
  const baseSlug = slugify(manifest.name) || "specialist";

  const created = await db.transaction(async (tx) => {
    // Slug is unique per workspace; suffix on collision.
    const collision = await tx.query.specialists.findFirst({
      where: (s, { and, eq: eq_ }) =>
        and(eq_(s.workspaceId, workspace.id), eq_(s.slug, baseSlug)),
    });
    const slug = collision
      ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`
      : baseSlug;

    const [sp] = await tx
      .insert(specialists)
      .values({
        workspaceId: workspace.id,
        name: manifest.name,
        slug,
        purpose: manifest.purpose,
        state: "draft",
        createdByUserId: userId,
      })
      .returning();
    if (!sp) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [version] = await tx
      .insert(specialistVersions)
      .values({
        specialistId: sp.id,
        version: 1,
        manifest,
        changeSummary: "Draft created from prompt",
        createdByUserId: userId,
      })
      .returning();
    await tx
      .update(specialists)
      .set({ currentVersionId: version!.id })
      .where(eq(specialists.id, sp.id));

    const [thread] = await tx
      .insert(threads)
      .values({
        workspaceId: workspace.id,
        specialistId: sp.id,
        title: manifest.name,
        createdByUserId: userId,
      })
      .returning();
    await tx.insert(messages).values([
      {
        threadId: thread!.id,
        seq: 1,
        role: "user",
        authorUserId: userId,
        content: prompt,
      },
      {
        threadId: thread!.id,
        seq: 2,
        role: "assistant",
        content:
          `Drafted **${manifest.name}** (v1).\n\n` +
          `Purpose: ${manifest.purpose}\n\n` +
          `Still needed: ${manifest.missing.join(", ")}.\n\n` +
          `Connect sources with the Atlas CLI (\`atlas source add\`) ` +
          `or keep refining here.`,
      },
    ]);
    return {
      specialist: { ...sp, currentVersionId: version!.id },
      threadId: thread!.id,
    };
  });

  await audit({
    action: "specialist.create",
    groupId: workspace.groupId,
    userId,
    detail: {
      type: "specialist",
      id: created.specialist.id,
      name: created.specialist.name,
    },
  });
  return created;
}

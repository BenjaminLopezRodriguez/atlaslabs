import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/audit";
import { requireSpecialistAccess } from "@/server/authz";
import {
  corrections,
  evaluationCases,
  evaluationSuites,
  memories,
  specialistVersions,
  specialists,
} from "@/server/db/schema";
import type { SpecialistManifest } from "@/server/specialist/manifest";

const kindSchema = z.enum([
  "accepted",
  "rejected",
  "edited",
  "preferred_alternative",
  "policy_violation",
  "missing_context",
  "reusable_instruction",
]);

export const correctionRouter = createTRPCRouter({
  /** Capture an explicit human signal on an output (operator+). */
  create: protectedProcedure
    .input(
      z.object({
        specialistId: z.string(),
        kind: kindSchema,
        note: z.string().max(10_000).default(""),
        replacement: z.string().max(50_000).optional(),
        runId: z.string().optional(),
        messageId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { specialist: sp, workspace } = await requireSpecialistAccess(
        ctx.db,
        ctx.user.id,
        input.specialistId,
        "operator",
      );
      const [row] = await ctx.db
        .insert(corrections)
        .values({
          specialistId: sp.id,
          kind: input.kind,
          note: input.note,
          replacement: input.replacement,
          runId: input.runId,
          messageId: input.messageId,
          createdByUserId: ctx.user.id,
        })
        .returning();
      await audit({
        action: "correction.create",
        groupId: workspace.groupId,
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "correction", id: row!.id, kind: input.kind },
      });
      return row;
    }),

  /**
   * Explicit promotion (builder+): correction → evaluation case, reusable
   * example (new specialist version), or durable memory. Nothing is promoted
   * automatically (spec §5 Correction).
   */
  promote: protectedProcedure
    .input(
      z.object({
        correctionId: z.string(),
        to: z.enum(["evaluation", "example", "memory"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const corr = await ctx.db.query.corrections.findFirst({
        where: eq(corrections.id, input.correctionId),
      });
      if (!corr) throw new TRPCError({ code: "NOT_FOUND" });
      if (corr.promotedTo) {
        throw new TRPCError({ code: "CONFLICT", message: "Already promoted" });
      }
      const { specialist: sp, workspace } = await requireSpecialistAccess(
        ctx.db,
        ctx.user.id,
        corr.specialistId,
        "builder",
      );

      let detail: Record<string, unknown> = {};

      if (input.to === "evaluation") {
        // Default suite, created on first promotion.
        let suite = await ctx.db.query.evaluationSuites.findFirst({
          where: eq(evaluationSuites.specialistId, sp.id),
        });
        if (!suite) {
          [suite] = await ctx.db
            .insert(evaluationSuites)
            .values({
              specialistId: sp.id,
              name: "Default",
              createdByUserId: ctx.user.id,
            })
            .returning();
        }
        const [evalCase] = await ctx.db
          .insert(evaluationCases)
          .values({
            suiteId: suite!.id,
            name: `From correction ${corr.id.slice(0, 8)}`,
            input: { message: corr.note || "Regression case" },
            expectation: corr.replacement ?? corr.note,
            fromCorrectionId: corr.id,
            createdByUserId: ctx.user.id,
          })
          .returning();
        detail = { evaluationCaseId: evalCase!.id, suiteId: suite!.id };
      }

      if (input.to === "example") {
        // Append to manifest examples and cut a new version.
        const current = sp.currentVersionId
          ? await ctx.db.query.specialistVersions.findFirst({
              where: eq(specialistVersions.id, sp.currentVersionId),
            })
          : null;
        const manifest = {
          ...(current?.manifest ?? {}),
        } as Partial<SpecialistManifest> & {
          examples?: { note: string; replacement?: string }[];
        };
        manifest.examples = [
          ...(manifest.examples ?? []),
          { note: corr.note, replacement: corr.replacement ?? undefined },
        ];
        const nextVersion = (current?.version ?? 0) + 1;
        const [version] = await ctx.db
          .insert(specialistVersions)
          .values({
            specialistId: sp.id,
            version: nextVersion,
            manifest: manifest as Record<string, unknown>,
            changeSummary: `Example promoted from correction ${corr.id.slice(0, 8)}`,
            createdByUserId: ctx.user.id,
          })
          .returning();
        await ctx.db
          .update(specialists)
          .set({ currentVersionId: version!.id })
          .where(eq(specialists.id, sp.id));
        detail = { specialistVersionId: version!.id, version: nextVersion };
      }

      if (input.to === "memory") {
        const [memory] = await ctx.db
          .insert(memories)
          .values({
            workspaceId: workspace.id,
            specialistId: sp.id,
            scope: workspace.groupId ? "group" : "personal",
            text: corr.replacement ?? corr.note,
            createdByUserId: ctx.user.id,
          })
          .returning();
        detail = { memoryId: memory!.id };
      }

      await ctx.db
        .update(corrections)
        .set({
          promotedTo: input.to,
          promotedAt: new Date(),
          promotedByUserId: ctx.user.id,
        })
        .where(eq(corrections.id, corr.id));

      await audit({
        action: "correction.promote",
        groupId: workspace.groupId,
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "correction", id: corr.id, to: input.to, ...detail },
      });
      return { ok: true, ...detail };
    }),
});

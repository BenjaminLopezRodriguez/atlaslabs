import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { requireWorkspaceAccess } from "@/server/authz";
import { specialistVersions, specialists } from "@/server/db/schema";
import { deploySpecialist } from "@/server/deployments";
import { createSpecialistFromPrompt } from "@/server/specialist/create";

export const specialistRouter = createTRPCRouter({
  /**
   * Turn a homepage/chat prompt into a draft specialist + version 1 + a chat
   * thread seeded with the draft summary (spec first-run flow steps 4–6).
   */
  createFromPrompt: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        prompt: z.string().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workspace } = await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "builder",
      );
      return createSpecialistFromPrompt(
        ctx.db,
        ctx.user.id,
        workspace,
        input.prompt,
      );
    }),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "viewer",
      );
      return ctx.db.query.specialists.findMany({
        where: eq(specialists.workspaceId, input.workspaceId),
        orderBy: desc(specialists.createdAt),
      });
    }),

  /** Deploy the current version (builder+). Gated on passing evaluations. */
  deploy: protectedProcedure
    .input(z.object({ specialistId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sp = await ctx.db.query.specialists.findFirst({
        where: eq(specialists.id, input.specialistId),
      });
      if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
      const { workspace } = await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        sp.workspaceId,
        "builder",
      );
      try {
        return await deploySpecialist(sp, workspace.groupId, ctx.user.id);
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err instanceof Error ? err.message : "Deploy failed",
        });
      }
    }),

  inspect: protectedProcedure
    .input(z.object({ specialistId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sp = await ctx.db.query.specialists.findFirst({
        where: eq(specialists.id, input.specialistId),
      });
      if (!sp) throw new TRPCError({ code: "NOT_FOUND" });
      await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        sp.workspaceId,
        "viewer",
      );
      const versions = await ctx.db.query.specialistVersions.findMany({
        where: eq(specialistVersions.specialistId, sp.id),
        orderBy: desc(specialistVersions.version),
      });
      return { specialist: sp, versions };
    }),
});

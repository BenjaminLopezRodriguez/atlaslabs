import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/audit";
import { cliTokens, deviceCodes } from "@/server/db/schema";

export const cliRouter = createTRPCRouter({
  /** Look up a pending device code the signed-in user typed/opened. */
  deviceInfo: protectedProcedure
    .input(z.object({ userCode: z.string() }))
    .query(async ({ ctx, input }) => {
      const dc = await ctx.db.query.deviceCodes.findFirst({
        where: eq(deviceCodes.userCode, input.userCode.toUpperCase().trim()),
      });
      if (!dc || dc.expiresAt < new Date() || dc.consumedAt || dc.deniedAt) {
        return { status: "invalid" as const };
      }
      if (dc.approvedUserId) return { status: "approved" as const };
      return { status: "pending" as const };
    }),

  approveDevice: protectedProcedure
    .input(z.object({ userCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const code = input.userCode.toUpperCase().trim();
      const dc = await ctx.db.query.deviceCodes.findFirst({
        where: eq(deviceCodes.userCode, code),
      });
      if (!dc || dc.expiresAt < new Date() || dc.consumedAt || dc.deniedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Code invalid or expired",
        });
      }
      await ctx.db
        .update(deviceCodes)
        .set({ approvedUserId: ctx.user.id })
        .where(eq(deviceCodes.id, dc.id));
      await audit({
        action: "cli.device.approve",
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "device_code", id: dc.id },
      });
      return { ok: true };
    }),

  denyDevice: protectedProcedure
    .input(z.object({ userCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(deviceCodes)
        .set({ deniedAt: new Date() })
        .where(eq(deviceCodes.userCode, input.userCode.toUpperCase().trim()));
      return { ok: true };
    }),

  tokens: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.cliTokens.findMany({
      where: and(
        eq(cliTokens.userId, ctx.user.id),
        isNull(cliTokens.revokedAt),
      ),
      columns: {
        id: true,
        tokenPrefix: true,
        label: true,
        lastUsedAt: true,
        createdAt: true,
      },
    }),
  ),

  revokeToken: protectedProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(cliTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(cliTokens.id, input.tokenId),
            eq(cliTokens.userId, ctx.user.id),
          ),
        );
      await audit({
        action: "cli.token.revoke",
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "cli_token", id: input.tokenId },
      });
      return { ok: true };
    }),
});

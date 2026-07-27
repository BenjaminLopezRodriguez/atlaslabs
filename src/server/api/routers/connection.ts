import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  deleteConnection,
  listConnections,
  saveConnection,
} from "@/server/connections";
import { githubConfigured, listRepos } from "@/server/github";

export const connectionRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => ({
    connections: await listConnections(ctx.user.id),
    githubConfigured: githubConfigured(),
  })),

  disconnect: protectedProcedure
    .input(z.object({ provider: z.enum(["github", "railway"]) }))
    .mutation(async ({ ctx, input }) => {
      await deleteConnection(ctx.user.id, input.provider);
      return { ok: true };
    }),

  /**
   * Railway is connected by pasting a project token rather than by OAuth:
   * Railway has no public OAuth app flow, and a project-scoped token is the
   * narrowest credential that can still run `railway up`.
   */
  connectRailway: protectedProcedure
    .input(z.object({ token: z.string().min(10).max(512) }))
    .mutation(async ({ ctx, input }) => {
      await saveConnection({
        userId: ctx.user.id,
        provider: "railway",
        accessToken: input.token.trim(),
        login: "project token",
      });
      return { ok: true };
    }),

  repos: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listRepos(ctx.user.id);
    } catch (err) {
      // A revoked token is a normal state, not a server fault.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }),
});

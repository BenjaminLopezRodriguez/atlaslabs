import { asc, eq, gt, and } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { requireSpecialistAccess } from "@/server/authz";
import { runEvents, runs } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";

export const runRouter = createTRPCRouter({
  /** Incremental run events for the chat run-status UI (poll with `after`). */
  events: protectedProcedure
    .input(z.object({ runId: z.string(), after: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      await requireSpecialistAccess(
        ctx.db,
        ctx.user.id,
        run.specialistId,
        "viewer",
      );
      const events = await ctx.db.query.runEvents.findMany({
        where: and(eq(runEvents.runId, run.id), gt(runEvents.seq, input.after)),
        orderBy: asc(runEvents.seq),
      });
      return { status: run.status, events };
    }),
});

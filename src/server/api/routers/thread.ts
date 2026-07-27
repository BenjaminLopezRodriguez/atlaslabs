import { TRPCError } from "@trpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { requireWorkspaceAccess } from "@/server/authz";
import type { db } from "@/server/db";
import { messages, threads } from "@/server/db/schema";
import { startRun } from "@/server/runs";

async function requireThread(
  ctx: { db: typeof db; user: { id: string } },
  threadId: string,
  min: "viewer" | "operator",
) {
  const thread = await ctx.db.query.threads.findFirst({
    where: eq(threads.id, threadId),
  });
  if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
  await requireWorkspaceAccess(ctx.db, ctx.user.id, thread.workspaceId, min);
  return thread;
}

export const threadRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "viewer",
      );
      return ctx.db.query.threads.findMany({
        where: eq(threads.workspaceId, input.workspaceId),
        orderBy: desc(threads.createdAt),
      });
    }),

  /** Open a blank chat thread in a workspace (ChatGPT-style "New chat"). */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().min(1).max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "operator",
      );
      const [thread] = await ctx.db
        .insert(threads)
        .values({
          workspaceId: input.workspaceId,
          title: input.title ?? "New chat",
          createdByUserId: ctx.user.id,
        })
        .returning();
      return thread!;
    }),

  messages: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const thread = await requireThread(ctx, input.threadId, "viewer");
      const rows = await ctx.db.query.messages.findMany({
        where: eq(messages.threadId, thread.id),
        orderBy: asc(messages.seq),
        with: { author: { columns: { id: true, name: true, email: true } } },
      });
      return { thread, messages: rows };
    }),

  /**
   * Post a user message. When the thread is bound to a specialist, a run is
   * queued; the worker streams status via run events and posts the reply.
   * Also renames blank "New chat" threads from the first message.
   */
  post: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1).max(50_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const thread = await requireThread(ctx, input.threadId, "operator");
      const [row] = await ctx.db
        .insert(messages)
        .values({
          threadId: thread.id,
          // Serialized against concurrent posts by the unique (thread, seq) index.
          seq: sql`(select coalesce(max(seq), 0) + 1 from ${messages} where ${messages.threadId} = ${thread.id})`,
          role: "user",
          authorUserId: ctx.user.id,
          content: input.content,
        })
        .returning();

      if (thread.title === "New chat") {
        const title =
          input.content.length > 60
            ? `${input.content.slice(0, 57).trimEnd()}…`
            : input.content;
        await ctx.db
          .update(threads)
          .set({ title })
          .where(eq(threads.id, thread.id));
      }

      let runId: string | null = null;
      if (thread.specialistId) {
        const run = await startRun({
          specialistId: thread.specialistId,
          input: { message: input.content },
          startedByUserId: ctx.user.id,
          threadId: thread.id,
        });
        runId = run.id;
      }
      return { message: row, runId };
    }),
});

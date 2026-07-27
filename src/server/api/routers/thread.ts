import { TRPCError } from "@trpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { requireWorkspaceAccess } from "@/server/authz";
import type { db } from "@/server/db";
import { messages, threads } from "@/server/db/schema";
import { getMachine, listMachines } from "@/server/machines/store";
import { startRun } from "@/server/runs";
import { runSpaceAgent } from "@/server/spaces/agent";

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
        /** Bind the thread to a space, so prompts act on that machine. */
        machineId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "operator",
      );
      /*
       * Resolve the machine as the caller before storing the id. Taking it from
       * the client unchecked would let anyone bind a thread to someone else's
       * space and then drive it through `post`.
       */
      if (input.machineId) {
        const machine = await getMachine(ctx.user.id, input.machineId);
        if (!machine) throw new TRPCError({ code: "NOT_FOUND" });
        if (machine.workspaceId !== input.workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That space is in a different workspace.",
          });
        }
      }
      const [thread] = await ctx.db
        .insert(threads)
        .values({
          workspaceId: input.workspaceId,
          title: input.title ?? "New chat",
          machineId: input.machineId ?? null,
          createdByUserId: ctx.user.id,
        })
        .returning();
      return thread!;
    }),

  /**
   * The public URL to preview a space, if it has one.
   *
   * Prefers 3000 — the port the templates serve on — and falls back to whatever
   * else is up. Returns null rather than a guess when no tunnel exists yet.
   */
  spacePreview: protectedProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ ctx, input }) => {
      const machine = await getMachine(ctx.user.id, input.machineId);
      if (!machine) throw new TRPCError({ code: "NOT_FOUND" });
      const withUrl = machine.ports.filter((p) => p.internalUrl);
      const chosen = withUrl.find((p) => p.port === 3000) ?? withUrl[0];
      return chosen
        ? { url: chosen.internalUrl!, port: chosen.port, slug: machine.slug }
        : { url: null as string | null, port: null, slug: machine.slug };
    }),

  /** Spaces the caller can bind a thread to, for the composer's picker. */
  spaces: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await listMachines(ctx.user.id, {
        workspaceId: input?.workspaceId ?? null,
      });
      return rows.map((m) => ({
        id: m.id,
        slug: m.slug,
        status: m.status,
        workspaceId: m.workspaceId,
      }));
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

      /*
       * A space-bound thread runs the agent inline: its tools touch a real VM,
       * so the caller waits for the work and gets the outcome, rather than the
       * UI implying a change that a queue has not made yet.
       */
      if (thread.machineId) {
        const machine = await getMachine(ctx.user.id, thread.machineId);
        if (!machine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This thread's space no longer exists.",
          });
        }

        const prior = await ctx.db.query.messages.findMany({
          where: eq(messages.threadId, thread.id),
          orderBy: asc(messages.seq),
        });

        let reply: string;
        try {
          const result = await runSpaceAgent({
            machine,
            prompt: input.content,
            // Everything before the message just posted.
            history: prior
              .filter((m) => m.id !== row!.id && m.role !== "system")
              .map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })),
            userId: ctx.user.id,
          });
          reply = result.text;
        } catch (err) {
          // The agent failing is a message in the thread, not a lost turn.
          reply = `I could not finish that: ${
            err instanceof Error ? err.message : String(err)
          }`;
        }

        const [assistant] = await ctx.db
          .insert(messages)
          .values({
            threadId: thread.id,
            seq: sql`(select coalesce(max(seq), 0) + 1 from ${messages} where ${messages.threadId} = ${thread.id})`,
            role: "assistant",
            content: reply,
          })
          .returning();
        return { message: row, runId: null, reply: assistant };
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
      return { message: row, runId, reply: null };
    }),
});

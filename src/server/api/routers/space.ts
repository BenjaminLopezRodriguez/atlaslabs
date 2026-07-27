import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { spaceEdits } from "@/server/db/schema";
import { cloneRepoIntoSpace } from "@/server/github";
import { getMachine, getMachineFile } from "@/server/machines/store";
import { deploySpace, ensureScaffold } from "@/server/railway";
import { isSpaceStoreConfigured } from "@/server/s3/space-store";
import {
  checkpointAfterEdit,
  listCheckpoints,
  restoreCheckpoint,
} from "@/server/spaces/checkpoints";
import { applyEdit, listThreadEdits, rejectEdit } from "@/server/spaces/edits";
import { buildIndex, getIndex } from "@/server/spaces/space-index";

/** Resolve a space the caller may act on, or 404. */
async function requireMachine(
  ctx: { user: { id: string } },
  machineId: string,
) {
  const machine = await getMachine(ctx.user.id, machineId);
  if (!machine) throw new TRPCError({ code: "NOT_FOUND" });
  return machine;
}

function fail(err: unknown): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: err instanceof Error ? err.message : String(err),
  });
}

export const spaceRouter = createTRPCRouter({
  /** Paths in the space, for @-mentions and file pickers. */
  files: protectedProcedure
    .input(
      z.object({
        machineId: z.string(),
        /** Substring filter, applied server-side so the client never holds the whole tree. */
        query: z.string().max(200).optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      const index =
        (await getIndex(machine.id)) ??
        (await buildIndex(machine, ctx.user.id).catch(() => null));
      if (!index) return { files: [], truncated: false };

      const q = input.query?.toLowerCase().trim();
      const matches = q
        ? index.files.filter((f) => f.toLowerCase().includes(q))
        : index.files;
      return {
        files: matches.slice(0, input.limit),
        truncated: matches.length > input.limit || index.truncated,
      };
    }),

  /** Rebuild the file map — after a clone, or when the tree changed underneath us. */
  reindex: protectedProcedure
    .input(z.object({ machineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      const index = await buildIndex(machine, ctx.user.id).catch(fail);
      return { count: index.files.length, truncated: index.truncated };
    }),

  /** File contents, for pinning an @-mentioned file into a prompt. */
  readFile: protectedProcedure
    .input(z.object({ machineId: z.string(), path: z.string().max(1024) }))
    .query(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      const bytes = await getMachineFile(machine, input.path).catch(fail);
      if (!bytes) return { path: input.path, content: null };
      const content = Buffer.from(bytes).toString("utf8");
      return {
        path: input.path,
        // Bounded: this is prompt context, not a file viewer.
        content: content.length > 64_000 ? content.slice(0, 64_000) : content,
      };
    }),

  /* ------------------------------- edits ------------------------------- */

  edits: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const thread = await ctx.db.query.threads.findFirst({
        where: (t, { eq: is }) => is(t.id, input.threadId),
      });
      if (!thread?.machineId) return [];
      // Authorization rides on the space, which is what the edit touches.
      await requireMachine(ctx, thread.machineId);
      return listThreadEdits(input.threadId);
    }),

  resolveEdit: protectedProcedure
    .input(z.object({ editId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const edit = await ctx.db.query.spaceEdits.findFirst({
        where: eq(spaceEdits.id, input.editId),
      });
      if (!edit) throw new TRPCError({ code: "NOT_FOUND" });
      const machine = await requireMachine(ctx, edit.machineId);
      if (!input.accept) return rejectEdit(edit);
      const applied = await applyEdit(edit, machine).catch(fail);
      // Checkpoint after the write, so the snapshot reflects what landed.
      await checkpointAfterEdit({ machine, message: `Accepted ${edit.path}` });
      return applied;
    }),

  /* ---------------------------- checkpoints ---------------------------- */

  checkpoints: protectedProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      return {
        configured: isSpaceStoreConfigured(),
        commits: await listCheckpoints(machine),
      };
    }),

  restoreCheckpoint: protectedProcedure
    .input(z.object({ machineId: z.string(), commitSha: z.string().length(64) }))
    .mutation(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      return restoreCheckpoint({ machine, commitSha: input.commitSha }).catch(
        fail,
      );
    }),

  /* ------------------------------ delivery ----------------------------- */

  /** Put the Dockerfile/compose/railway.json back if they were removed. */
  restoreScaffold: protectedProcedure
    .input(z.object({ machineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      const restored = await ensureScaffold(machine).catch(fail);
      return { restored };
    }),

  deploy: protectedProcedure
    .input(z.object({ machineId: z.string(), dir: z.string().max(256).optional() }))
    .mutation(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      return deploySpace({
        userId: ctx.user.id,
        machine,
        dir: input.dir ?? null,
      }).catch(fail);
    }),

  cloneRepo: protectedProcedure
    .input(
      z.object({
        machineId: z.string(),
        fullName: z.string().max(256),
        branch: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const machine = await requireMachine(ctx, input.machineId);
      const result = await cloneRepoIntoSpace({
        userId: ctx.user.id,
        machine,
        fullName: input.fullName,
        branch: input.branch ?? null,
      }).catch(fail);
      // The tree just changed completely; a stale map would misdirect the agent.
      await buildIndex(machine, ctx.user.id).catch(() => null);
      return result;
    }),
});

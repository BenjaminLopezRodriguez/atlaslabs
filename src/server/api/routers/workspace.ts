import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPersonalWorkspace, requireWorkspaceAccess } from "@/server/authz";
import { memberships, workspaces } from "@/server/db/schema";

export const workspaceRouter = createTRPCRouter({
  /** Personal workspace plus every group workspace the caller belongs to. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const personal = await getPersonalWorkspace(ctx.db, ctx.user.id);
    const groupIds = (
      await ctx.db.query.memberships.findMany({
        where: eq(memberships.userId, ctx.user.id),
        columns: { groupId: true },
      })
    ).map((m) => m.groupId);
    const groupWorkspaces = groupIds.length
      ? await ctx.db.query.workspaces.findMany({
          where: inArray(workspaces.groupId, groupIds),
          with: { group: { columns: { id: true, name: true, slug: true } } },
        })
      : [];
    return { personal, groupWorkspaces };
  }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspace, role } = await requireWorkspaceAccess(
        ctx.db,
        ctx.user.id,
        input.workspaceId,
        "viewer",
      );
      return { workspace, role };
    }),
});

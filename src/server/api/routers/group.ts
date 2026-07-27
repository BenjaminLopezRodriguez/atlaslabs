import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/audit";
import { requireGroupRole } from "@/server/authz";
import { groups, invitations, memberships } from "@/server/db/schema";
import { createGroup, inviteToGroup } from "@/server/groups";

const roleSchema = z.enum(["owner", "builder", "operator", "viewer"]);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const groupRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: groups.id,
        name: groups.name,
        slug: groups.slug,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(groups, eq(memberships.groupId, groups.id))
      .where(eq(memberships.userId, ctx.user.id));
    return rows;
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(256) }))
    .mutation(({ ctx, input }) => createGroup(ctx.db, ctx.user.id, input.name)),

  members: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireGroupRole(ctx.db, ctx.user.id, input.groupId, "viewer");
      return ctx.db.query.memberships.findMany({
        where: eq(memberships.groupId, input.groupId),
        with: { user: { columns: { id: true, name: true, email: true } } },
      });
    }),

  invite: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        email: z.string().email(),
        role: roleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireGroupRole(ctx.db, ctx.user.id, input.groupId, "owner");
      // ponytail: no e-mail provider yet — share the accept link manually.
      return inviteToGroup(
        ctx.db,
        ctx.user.id,
        input.groupId,
        input.email,
        input.role,
      );
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await ctx.db.query.invitations.findFirst({
        where: eq(invitations.tokenHash, sha256(input.token)),
      });
      if (
        !inv ||
        inv.revokedAt ||
        inv.acceptedAt ||
        inv.expiresAt < new Date()
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation is invalid or expired",
        });
      }
      if (ctx.user.email.toLowerCase() !== inv.email && inv.email !== "*") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invitation was issued to a different e-mail",
        });
      }
      await ctx.db.transaction(async (tx) => {
        await tx
          .insert(memberships)
          .values({ groupId: inv.groupId, userId: ctx.user.id, role: inv.role })
          .onConflictDoNothing();
        await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(eq(invitations.id, inv.id));
      });
      await audit({
        action: "member.join",
        groupId: inv.groupId,
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "membership", role: inv.role, invitationId: inv.id },
      });
      return { groupId: inv.groupId, role: inv.role };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ groupId: z.string(), invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireGroupRole(ctx.db, ctx.user.id, input.groupId, "owner");
      await ctx.db
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.groupId, input.groupId),
            isNull(invitations.revokedAt),
          ),
        );
      await audit({
        action: "member.invite.revoke",
        groupId: input.groupId,
        userId: ctx.user.id,
        deviceId: ctx.user.deviceId,
        detail: { type: "invitation", id: input.invitationId },
      });
      return { ok: true };
    }),
});

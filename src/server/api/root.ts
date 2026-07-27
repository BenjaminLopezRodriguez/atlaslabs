import { cliRouter } from "@/server/api/routers/cli";
import { connectionRouter } from "@/server/api/routers/connection";
import { correctionRouter } from "@/server/api/routers/correction";
import { spaceRouter } from "@/server/api/routers/space";
import { groupRouter } from "@/server/api/routers/group";
import { runRouter } from "@/server/api/routers/run";
import { specialistRouter } from "@/server/api/routers/specialist";
import { threadRouter } from "@/server/api/routers/thread";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  cli: cliRouter,
  connection: connectionRouter,
  correction: correctionRouter,
  space: spaceRouter,
  group: groupRouter,
  run: runRouter,
  specialist: specialistRouter,
  thread: threadRouter,
  workspace: workspaceRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);

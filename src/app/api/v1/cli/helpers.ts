import { TRPCError } from "@trpc/server";

import { cliUserFromRequest, unauthorized } from "@/server/cli-auth";

export { unauthorized };

/** Authenticate; returns user or a ready 401 Response. */
export async function requireCli(req: Request) {
  const user = await cliUserFromRequest(req);
  return user ?? null;
}

/** Map thrown authz/TRPC errors to plain HTTP for the REST surface. */
export function toHttpError(err: unknown): Response {
  if (err instanceof TRPCError) {
    const status =
      err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 400;
    return Response.json({ error: err.message }, { status });
  }
  console.error("[cli-api]", err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}

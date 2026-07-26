import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { artifacts } from "@/server/db/schema";

import { authorizeRun } from "../helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await authorizeRun(req, runId, "artifacts:read");
  if ("error" in auth) return auth.error;

  const rows = await db.query.artifacts.findMany({
    where: eq(artifacts.runId, runId),
  });
  return Response.json({
    artifacts: rows.map((a) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      bytes: a.bytes,
      content: a.content,
      createdAt: a.createdAt,
    })),
  });
}

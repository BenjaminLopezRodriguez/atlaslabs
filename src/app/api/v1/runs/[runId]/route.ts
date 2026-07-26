import { authorizeRun } from "./helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await authorizeRun(req, runId, "runs:read");
  if ("error" in auth) return auth.error;
  const { run } = auth;
  return Response.json({
    id: run.id,
    status: run.status,
    specialistId: run.specialistId,
    specialistVersionId: run.specialistVersionId,
    input: run.input,
    output: run.output,
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  });
}

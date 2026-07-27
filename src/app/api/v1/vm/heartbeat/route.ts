import { requireVm, vmUnauthorized } from "../helpers";

/**
 * Liveness, and nothing else.
 *
 * `verifyDeployToken` already stamps `lastSeenAt`, so this route's only job is
 * to answer whether the credential still works — which is what a container
 * needs to know before it decides its Atlas integration is broken.
 */
export async function POST(req: Request) {
  const principal = await requireVm(req);
  if (!principal) return vmUnauthorized();

  return Response.json({
    ok: true,
    machine: principal.machine.slug,
    liveUrl: principal.token.liveUrl,
  });
}

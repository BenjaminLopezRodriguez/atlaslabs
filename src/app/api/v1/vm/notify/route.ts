import { z } from "zod";

import { deliverDeployUpdate, MAX_UPDATE_CHARS } from "@/server/deploy/notify";
import { claimNotification } from "@/server/deploy/tokens";

import { requireVm, vmError, vmUnauthorized } from "../helpers";

const schema = z.object({
  message: z.string().min(1).max(MAX_UPDATE_CHARS),
});

/**
 * An update from the deployment to everyone on the project.
 *
 * The quota is claimed before the message is delivered, so a container that
 * loops on this endpoint burns its budget rather than the team's attention.
 * Exceeding it is a 429 the deployment can log — not an error that stops it.
 */
export async function POST(req: Request) {
  const principal = await requireVm(req);
  if (!principal) return vmUnauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return vmError(400, "invalid_request");

  if (!(await claimNotification(principal.token))) {
    return vmError(429, "notification_quota_exhausted");
  }

  const result = await deliverDeployUpdate({
    machine: principal.machine,
    kind: "update",
    liveUrl: principal.token.liveUrl,
    message: parsed.data.message,
  });

  return Response.json({ ok: true, ...result });
}

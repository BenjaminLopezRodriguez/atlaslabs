import { z } from "zod";

import { deliverDeployUpdate } from "@/server/deploy/notify";
import { isSafeHttpUrl } from "@/lib/url";
import { claimNotification, recordLiveUrl } from "@/server/deploy/tokens";

import { requireVm, vmError, vmUnauthorized } from "../helpers";

const schema = z.object({
  /**
   * Where the deployment is serving.
   *
   * http(s) only: this URL is emailed to the whole project as a link, and
   * `z.string().url()` alone would accept `javascript:` and `data:`.
   */
  url: z.string().max(1024).refine(isSafeHttpUrl, "url must be http or https"),
  /** Optional note, e.g. the commit or what changed. */
  note: z.string().max(500).optional(),
});

/**
 * "I am up, here is the link."
 *
 * The URL is recorded whether or not anyone is told, so the platform always
 * knows where a deployment is even when email is unconfigured or the token has
 * spent its notification budget.
 */
export async function POST(req: Request) {
  const principal = await requireVm(req);
  if (!principal) return vmUnauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return vmError(400, "invalid_request");

  const { url, note } = parsed.data;
  await recordLiveUrl(principal.token.id, url);

  // Announce only the first time this token reports ready. A container that
  // restarts every thirty seconds must not mail the team every thirty seconds.
  const firstReport = principal.token.liveUrl !== url;
  if (!firstReport) {
    return Response.json({ ok: true, url, notified: false });
  }

  if (!(await claimNotification(principal.token))) {
    return Response.json({ ok: true, url, notified: false, reason: "quota" });
  }

  const result = await deliverDeployUpdate({
    machine: principal.machine,
    kind: "ready",
    liveUrl: url,
    message: note?.trim()
      ? `${principal.machine.slug} is live at ${url}\n\n${note.trim()}`
      : `${principal.machine.slug} is live at ${url}`,
  });

  return Response.json({ ok: true, url, notified: true, ...result });
}

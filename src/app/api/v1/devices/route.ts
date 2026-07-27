import { listDevices } from "@/server/devices/store";

import { requireCli, toHttpError, unauthorized } from "../cli/helpers";

/** The caller's own devices. Never another user's. */
export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const rows = await listDevices(user.id);
    return Response.json({
      devices: rows.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        platform: d.platform,
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt,
        revokedAt: d.revokedAt,
        createdAt: d.createdAt,
        /** So a client can highlight "this device" without extra calls. */
        current: d.id === user.deviceId,
      })),
    });
  } catch (err) {
    return toHttpError(err);
  }
}

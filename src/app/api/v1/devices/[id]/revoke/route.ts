import { audit } from "@/server/audit";
import { revokeDevice } from "@/server/devices/store";

import { requireCli, toHttpError, unauthorized } from "../../../cli/helpers";

/**
 * Sign a device out — revokes it and all of its tokens.
 *
 * Revoking the device you are calling from is allowed and immediately
 * invalidates the token used to make this call. That is the correct behaviour
 * for "sign out everywhere".
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const revoked = await revokeDevice({ userId: user.id, deviceId: id });

    // 404 rather than 403 — another user's device must not be distinguishable
    // from one that does not exist.
    if (!revoked) {
      return Response.json({ error: "device_not_found" }, { status: 404 });
    }

    await audit({
      action: "device.revoke",
      userId: user.id,
      deviceId: user.deviceId,
      detail: { type: "device", id, self: id === user.deviceId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toHttpError(err);
  }
}

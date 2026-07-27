import { getMachine } from "@/server/machines/store";
import { getPing } from "@/server/pings/store";

import {
  notFound,
  requireCli,
  toMachineHttpError,
  unauthorized,
} from "../../machines/helpers";

/** Poll a single ping. The CLI's blocking wait is a loop over this. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const ping = await getPing(id);
    if (!ping) return notFound();

    // Reachability is the machine's, so a ping cannot leak across tenants.
    const machine = await getMachine(user.id, ping.machineId);
    if (!machine) return notFound();

    return Response.json({
      ping: {
        id: ping.id,
        status: ping.status,
        question: ping.question,
        answer: ping.answer,
        createdAt: ping.createdAt,
        answeredAt: ping.answeredAt,
        expiresAt: ping.expiresAt,
      },
    });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

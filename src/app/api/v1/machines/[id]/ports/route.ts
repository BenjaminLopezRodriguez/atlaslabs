import { getMachine } from "@/server/machines/store";

import {
  notFound,
  requireCli,
  toMachineHttpError,
  unauthorized,
} from "../../helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const machine = await getMachine(user.id, id);
    if (!machine) return notFound();
    return Response.json({ ports: machine.ports, status: machine.status });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

import { z } from "zod";

import { audit } from "@/server/audit";
import { execOnMachine, getMachine } from "@/server/machines/store";

import {
  notFound,
  requireCli,
  toMachineHttpError,
  unauthorized,
} from "../../helpers";

const execSchema = z.object({
  cmd: z.string().min(1).max(8192),
  cwd: z.string().max(512).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const parsed = execSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const machine = await getMachine(user.id, id);
    if (!machine) return notFound();

    const result = await execOnMachine(machine, parsed.data, {
      userId: user.id,
      deviceId: user.deviceId,
    });

    await audit({
      action: "machine.exec",
      userId: user.id,
      deviceId: user.deviceId,
      detail: {
        type: "machine",
        id: machine.id,
        slug: machine.slug,
        cmd: parsed.data.cmd.slice(0, 256),
        exitCode: result.exitCode,
      },
    });

    return Response.json(result);
  } catch (err) {
    return toMachineHttpError(err);
  }
}

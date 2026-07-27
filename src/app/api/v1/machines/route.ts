import { z } from "zod";

import { audit } from "@/server/audit";
import { createMachine, listMachines } from "@/server/machines/store";

import {
  requireCli,
  serialize,
  toMachineHttpError,
  unauthorized,
} from "./helpers";

const createSchema = z.object({
  slug: z.string(),
  workspaceId: z.string().optional(),
  name: z.string().max(256).optional(),
  templateId: z.string().max(64).optional(),
  region: z.string().max(32).optional(),
});

export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const machine = await createMachine({
      userId: user.id,
      deviceId: user.deviceId,
      ...parsed.data,
    });

    await audit({
      action: "machine.create",
      userId: user.id,
      deviceId: user.deviceId,
      detail: { type: "machine", id: machine.id, slug: machine.slug },
    });

    return Response.json({ machine: serialize(machine) }, { status: 201 });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    const rows = await listMachines(user.id, { workspaceId });
    return Response.json({ machines: rows.map(serialize) });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

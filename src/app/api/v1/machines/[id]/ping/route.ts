import { z } from "zod";

import { audit } from "@/server/audit";
import { getMachine } from "@/server/machines/store";
import { createPing, listPings, PingError } from "@/server/pings/store";

import {
  notFound,
  requireCli,
  toMachineHttpError,
  unauthorized,
} from "../../helpers";

const askSchema = z.object({
  question: z.string().min(1).max(4000),
  context: z.string().max(256).optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

/** Ask the human a question. Returns immediately; the caller polls or waits. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const parsed = askSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const machine = await getMachine(user.id, id);
    if (!machine) return notFound();

    const { ping, replyUrl, notified, notifyError } = await createPing({
      machine,
      question: parsed.data.question,
      context: parsed.data.context,
      ttlSeconds: parsed.data.ttlSeconds,
      askedByUserId: user.id,
      askedByDeviceId: user.deviceId,
    });

    await audit({
      action: "ping.create",
      userId: user.id,
      deviceId: user.deviceId,
      detail: { type: "ping", id: ping.id, machineId: machine.id },
    });

    return Response.json(
      {
        ping: {
          id: ping.id,
          status: ping.status,
          question: ping.question,
          expiresAt: ping.expiresAt,
        },
        replyUrl,
        notified,
        notifyError: notifyError ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof PingError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return toMachineHttpError(err);
  }
}

/** The message log for this machine — the thread an agent reads to catch up. */
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

    const rows = await listPings(machine.id);
    return Response.json({
      pings: rows.map((p) => ({
        id: p.id,
        status: p.status,
        question: p.question,
        answer: p.answer,
        context: p.context,
        createdAt: p.createdAt,
        answeredAt: p.answeredAt,
      })),
    });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

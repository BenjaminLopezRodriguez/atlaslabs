import {
  getMachine,
  getMachineFile,
  putMachineFile,
} from "@/server/machines/store";

import {
  notFound,
  requireCli,
  toMachineHttpError,
  unauthorized,
} from "../../../helpers";

/** Uploads are bounded — an unbounded body is a memory exhaustion vector. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id, path } = await params;

    const declared = req.headers.get("content-length");
    if (declared && Number(declared) > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "file_too_large" }, { status: 413 });
    }

    const machine = await getMachine(user.id, id);
    if (!machine) return notFound();

    const body = new Uint8Array(await req.arrayBuffer());
    // re-check: content-length is a client claim, the body is the truth
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "file_too_large" }, { status: 413 });
    }

    await putMachineFile(machine, path.join("/"), body);
    return Response.json({ ok: true, bytes: body.byteLength });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { id, path } = await params;
    const machine = await getMachine(user.id, id);
    if (!machine) return notFound();

    const body = await getMachineFile(machine, path.join("/"));
    if (!body) return Response.json({ error: "file_not_found" }, { status: 404 });

    return new Response(body as BodyInit, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(body.byteLength),
      },
    });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

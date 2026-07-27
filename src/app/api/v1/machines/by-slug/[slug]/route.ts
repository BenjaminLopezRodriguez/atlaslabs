import { getMachineBySlug } from "@/server/machines/store";

import {
  notFound,
  requireCli,
  serialize,
  toMachineHttpError,
  unauthorized,
} from "../../helpers";

/** What Atlas Browser calls to resolve `atlas://workspace/<slug>`. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  try {
    const { slug } = await params;
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    const machine = await getMachineBySlug(user.id, slug, { workspaceId });
    if (!machine) return notFound();
    return Response.json({ machine: serialize(machine) });
  } catch (err) {
    return toMachineHttpError(err);
  }
}

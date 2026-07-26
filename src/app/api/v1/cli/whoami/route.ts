import { requireCli, unauthorized } from "../helpers";

export async function GET(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();
  return Response.json({ id: user.id, email: user.email, name: user.name });
}

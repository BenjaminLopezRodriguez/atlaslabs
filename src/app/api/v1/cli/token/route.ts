import { eq } from "drizzle-orm";

import { audit } from "@/server/audit";
import { sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { cliTokens } from "@/server/db/schema";

/** Self-revoke the presented CLI token (`atlas logout`). */
export async function DELETE(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token?.startsWith("atlas_pat_")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const row = await db.query.cliTokens.findFirst({
    where: eq(cliTokens.tokenHash, sha256(token)),
  });
  if (row && !row.revokedAt) {
    await db
      .update(cliTokens)
      .set({ revokedAt: new Date() })
      .where(eq(cliTokens.id, row.id));
    await audit({
      action: "cli.token.revoke",
      userId: row.userId,
      detail: { type: "cli_token", id: row.id, via: "logout" },
    });
  }
  return Response.json({ ok: true });
}

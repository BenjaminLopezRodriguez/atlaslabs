import { eq } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/server/audit";
import { mintToken, sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { cliTokens, deviceCodes } from "@/server/db/schema";

const bodySchema = z.object({ device_code: z.string() });

/**
 * Poll for the CLI token. Returns the plaintext token exactly once, minted
 * at the first poll after approval.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const dc = await db.query.deviceCodes.findFirst({
    where: eq(deviceCodes.deviceCodeHash, sha256(parsed.data.device_code)),
  });
  if (!dc) return Response.json({ error: "invalid_grant" }, { status: 400 });
  if (dc.deniedAt) {
    return Response.json({ error: "access_denied" }, { status: 400 });
  }
  if (dc.expiresAt < new Date() || dc.consumedAt) {
    return Response.json({ error: "expired_token" }, { status: 400 });
  }
  if (!dc.approvedUserId) {
    return Response.json({ error: "authorization_pending" }, { status: 400 });
  }

  const { secret, hash, prefix } = mintToken("atlas_pat");
  const [tok] = await db
    .insert(cliTokens)
    .values({ userId: dc.approvedUserId, tokenHash: hash, tokenPrefix: prefix })
    .returning();
  await db
    .update(deviceCodes)
    .set({ consumedAt: new Date(), mintedTokenId: tok!.id })
    .where(eq(deviceCodes.id, dc.id));
  await audit({
    action: "cli.token.mint",
    userId: dc.approvedUserId,
    detail: { type: "cli_token", id: tok!.id },
  });

  return Response.json({ access_token: secret, token_type: "bearer" });
}

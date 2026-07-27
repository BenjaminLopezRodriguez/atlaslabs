import { randomBytes, randomInt } from "node:crypto";

import { z } from "zod";

import { sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { deviceCodes } from "@/server/db/schema";

const TTL_MS = 10 * 60 * 1000;

/*
 * Optional client hints describing the device starting this flow. All are
 * UNTRUSTED: `installation_id` only ever matches within the authenticating
 * user's own devices, and the rest are cosmetic. The authoritative device id is
 * minted server-side when the token is issued.
 */
const hintsSchema = z
  .object({
    installation_id: z.string().min(1).max(128).optional(),
    kind: z
      .enum(["cli", "browser", "web", "ios", "android", "desktop"])
      .optional(),
    label: z.string().max(128).optional(),
    platform: z.string().max(64).optional(),
    app_version: z.string().max(32).optional(),
  })
  .partial();

/** Start a device-authorization flow (RFC 8628 style). */
export async function POST(req: Request) {
  const hints =
    hintsSchema.safeParse(await req.json().catch(() => ({}))).data ?? {};
  const deviceCode = `atlas_dc_${randomBytes(24).toString("base64url")}`;
  // Human-typable code: XXXX-XXXX from an unambiguous alphabet.
  const alphabet = "BCDFGHJKLMNPQRSTVWXZ23456789";
  const pick = () => alphabet[randomInt(alphabet.length)];
  const userCode = `${Array.from({ length: 4 }, pick).join("")}-${Array.from(
    { length: 4 },
    pick,
  ).join("")}`;

  await db.insert(deviceCodes).values({
    userCode,
    deviceCodeHash: sha256(deviceCode),
    expiresAt: new Date(Date.now() + TTL_MS),
    installationId: hints.installation_id ?? null,
    deviceKind: hints.kind ?? "cli",
    deviceLabel: hints.label ?? null,
    devicePlatform: hints.platform ?? null,
    deviceAppVersion: hints.app_version ?? null,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${base}/device`,
    verification_uri_complete: `${base}/device?code=${userCode}`,
    expires_in: TTL_MS / 1000,
    interval: 3,
  });
}

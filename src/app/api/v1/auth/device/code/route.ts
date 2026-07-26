import { randomBytes, randomInt } from "node:crypto";

import { sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { deviceCodes } from "@/server/db/schema";

const TTL_MS = 10 * 60 * 1000;

/** Start a device-authorization flow (RFC 8628 style). */
export async function POST() {
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

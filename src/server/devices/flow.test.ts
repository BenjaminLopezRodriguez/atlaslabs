import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ANTHROPIC_API_KEY = "";

import { eq, inArray } from "drizzle-orm";

import { POST as deviceCodePost } from "@/app/api/v1/auth/device/code/route";
import { POST as deviceTokenPost } from "@/app/api/v1/auth/device/token/route";
import { GET as devicesGet } from "@/app/api/v1/devices/route";
import { POST as revokePost } from "@/app/api/v1/devices/[id]/revoke/route";
import { cliUserFromRequest } from "@/server/cli-auth";
import { resolveDevice, revokeDevice } from "@/server/devices/store";
import { db } from "@/server/db";
import { cliTokens, deviceCodes, devices, users } from "@/server/db/schema";

const uid = `user_devflow_${randomUUID().slice(0, 8)}`;

void after(async () => {
  await db.delete(cliTokens).where(eq(cliTokens.userId, uid));
  await db.delete(devices).where(eq(devices.userId, uid));
  await db.delete(users).where(eq(users.id, uid));
  process.exit(0);
});

function post(url: string, body: unknown, token?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Run the device-authorization flow to completion, returning the token. */
async function login(installationId: string, label: string) {
  const codeRes = await deviceCodePost(
    post("http://localhost/api/v1/auth/device/code", {
      installation_id: installationId,
      kind: "cli",
      label,
      platform: "macOS 27",
    }),
  );
  const code = (await codeRes.json()) as {
    device_code: string;
    user_code: string;
  };

  // stand in for the user approving in the browser
  await db
    .update(deviceCodes)
    .set({ approvedUserId: uid })
    .where(eq(deviceCodes.userCode, code.user_code));

  const tokenRes = await deviceTokenPost(
    post("http://localhost/api/v1/auth/device/token", {
      device_code: code.device_code,
    }),
  );
  const json = (await tokenRes.json()) as { access_token?: string };
  assert.ok(json.access_token, "device flow must mint a token");
  return json.access_token;
}

void test("device flow: token is bound to a server-minted device", async () => {
  await db
    .insert(users)
    .values({ id: uid, email: `${uid}@test.local` })
    .onConflictDoNothing();

  const installA = `inst_${randomUUID()}`;
  const tokenA = await login(installA, "Laptop");

  // the device id is resolvable from the token alone — no client header
  const principal = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${tokenA}` },
    }),
  );
  assert.equal(principal?.id, uid);
  assert.ok(principal?.deviceId, "principal carries a device id");

  // signing in again from the same install keeps one device identity
  const tokenA2 = await login(installA, "Laptop");
  const principal2 = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${tokenA2}` },
    }),
  );
  assert.equal(
    principal2?.deviceId,
    principal?.deviceId,
    "re-login reuses the device",
  );

  // a second install is a separate device
  const tokenB = await login(`inst_${randomUUID()}`, "Phone");
  const principalB = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  );
  assert.notEqual(principalB?.deviceId, principal?.deviceId);

  // the list shows both, and marks which one is calling
  const listRes = await devicesGet(
    new Request("http://localhost/api/v1/devices", {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  );
  const { devices: rows } = (await listRes.json()) as {
    devices: { id: string; label: string; current: boolean }[];
  };
  assert.ok(rows.length >= 2);
  assert.equal(
    rows.filter((r) => r.current).length,
    1,
    "exactly one device is current",
  );
  assert.equal(rows.find((r) => r.current)?.id, principalB?.deviceId);

  // revoking the laptop from the phone kills the laptop's tokens only
  const laptopDeviceId = principal.deviceId;
  assert.ok(laptopDeviceId);
  const revokeRes = await revokePost(
    post(`http://localhost/api/v1/devices/${laptopDeviceId}/revoke`, {}, tokenB),
    { params: Promise.resolve({ id: laptopDeviceId }) },
  );
  assert.equal(revokeRes.status, 200);

  const afterRevoke = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${tokenA2}` },
    }),
  );
  assert.equal(afterRevoke, null, "revoked device's token is dead");

  const stillAlive = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  );
  assert.ok(stillAlive, "the other device keeps working");
});

/*
 * D5: the web path keys its device on the WorkOS session id. This exercises
 * resolveDevice the way getSessionUser() calls it, without standing up AuthKit.
 */
void test("web session and CLI on one laptop are separate devices", async () => {
  await db
    .insert(users)
    .values({ id: uid, email: `${uid}@test.local` })
    .onConflictDoNothing();

  const sid = `session_${randomUUID()}`;
  const web = await resolveDevice({
    userId: uid,
    installationId: sid,
    kind: "web",
    label: "Web session",
  });
  // same browser, same session -> one row
  const webAgain = await resolveDevice({
    userId: uid,
    installationId: sid,
    kind: "web",
    label: "Web session",
  });
  assert.equal(webAgain.id, web.id, "one row per WorkOS session");

  const cliToken = await login(`inst_${randomUUID()}`, "Same laptop CLI");
  const cli = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${cliToken}` },
    }),
  );

  assert.notEqual(
    cli?.deviceId,
    web.id,
    "web and CLI are separately revocable credentials and must not collapse",
  );

  // revoking the web session leaves the CLI signed in
  assert.equal(await revokeDevice({ userId: uid, deviceId: web.id }), true);
  const cliStillAlive = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${cliToken}` },
    }),
  );
  assert.ok(cliStillAlive, "revoking the browser must not sign out the CLI");

  // a fresh WorkOS session after revocation earns a new row
  const afterRevoke = await resolveDevice({
    userId: uid,
    installationId: `session_${randomUUID()}`,
    kind: "web",
    label: "Web session",
  });
  assert.notEqual(afterRevoke.id, web.id);
});

void test("revoking another user's device 404s without leaking existence", async () => {
  const otherUid = `user_devflow_x_${randomUUID().slice(0, 8)}`;
  await db
    .insert(users)
    .values([
      { id: uid, email: `${uid}@test.local` },
      { id: otherUid, email: `${otherUid}@test.local` },
    ])
    .onConflictDoNothing();

  const token = await login(`inst_${randomUUID()}`, "Victim laptop");
  const victim = await cliUserFromRequest(
    new Request("http://localhost/x", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

  const [attackerDevice] = await db
    .insert(devices)
    .values({ userId: otherUid, kind: "cli", label: "Attacker" })
    .returning();

  const res = await revokePost(
    post(
      `http://localhost/api/v1/devices/${attackerDevice!.id}/revoke`,
      {},
      token,
    ),
    { params: Promise.resolve({ id: attackerDevice!.id }) },
  );
  assert.equal(res.status, 404, "must not be distinguishable from not-found");

  const row = await db.query.devices.findFirst({
    where: eq(devices.id, attackerDevice!.id),
  });
  assert.equal(row?.revokedAt, null, "the other user's device is untouched");
  assert.ok(victim?.deviceId);

  await db.delete(devices).where(inArray(devices.userId, [otherUid]));
  await db.delete(users).where(eq(users.id, otherUid));
});

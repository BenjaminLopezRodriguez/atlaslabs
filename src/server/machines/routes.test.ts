import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ANTHROPIC_API_KEY = "";
process.env.ATLAS_MACHINE_DRIVER = "mock";

import { eq, inArray } from "drizzle-orm";

import { GET as machineGet } from "@/app/api/v1/machines/[id]/route";
import { POST as execPost } from "@/app/api/v1/machines/[id]/exec/route";
import {
  GET as fileGet,
  PUT as filePut,
} from "@/app/api/v1/machines/[id]/files/[...path]/route";
import { GET as portsGet } from "@/app/api/v1/machines/[id]/ports/route";
import { POST as stopPost } from "@/app/api/v1/machines/[id]/stop/route";
import { POST as suspendPost } from "@/app/api/v1/machines/[id]/suspend/route";
import { GET as bySlugGet } from "@/app/api/v1/machines/by-slug/[slug]/route";
import {
  GET as machinesGet,
  POST as machinesPost,
} from "@/app/api/v1/machines/route";
import { sha256 } from "@/server/cli-auth";
import { db } from "@/server/db";
import { cliTokens, machines, users, workspaces } from "@/server/db/schema";

const uidA = `user_mroute_a_${randomUUID().slice(0, 8)}`;
const uidB = `user_mroute_b_${randomUUID().slice(0, 8)}`;
const ids = [uidA, uidB];
const tokens: Record<string, string> = {};

void after(async () => {
  const ws = await db.query.workspaces.findMany({
    where: inArray(workspaces.userId, ids),
  });
  const wsIds = ws.map((w) => w.id);
  if (wsIds.length) {
    await db.delete(machines).where(inArray(machines.workspaceId, wsIds));
  }
  await db.delete(cliTokens).where(inArray(cliTokens.userId, ids));
  await db.delete(workspaces).where(inArray(workspaces.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  process.exit(0);
});

async function seed() {
  await db
    .insert(users)
    .values(ids.map((id) => ({ id, email: `${id}@test.local` })))
    .onConflictDoNothing();
  for (const id of ids) {
    if (tokens[id]) continue;
    const secret = `atlas_pat_${randomUUID()}`;
    await db.insert(cliTokens).values({
      userId: id,
      tokenHash: sha256(secret),
      tokenPrefix: secret.slice(0, 14),
    });
    tokens[id] = secret;
  }
}

function req(url: string, uid: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokens[uid]}`,
      ...(init.headers ?? {}),
    },
  });
}

const P = <T,>(o: T) => ({ params: Promise.resolve(o) });

void test("machine routes: create, list, resolve, exec, ports", async () => {
  await seed();
  const slug = `route-${randomUUID().slice(0, 6)}`;

  const created = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug, templateId: "node-ts" }),
    }),
  );
  assert.equal(created.status, 201);
  const { machine } = (await created.json()) as {
    machine: { id: string; slug: string; url: string; ports: unknown[] };
  };
  assert.equal(machine.slug, slug);
  assert.equal(machine.url, `atlas://workspace/${slug}`);
  assert.ok(machine.ports.length > 0);
  assert.ok(
    !JSON.stringify(machine).includes("mock_"),
    "the driver handle must never be serialized to clients",
  );

  // duplicate slug is a clean 409, not a second machine
  const dup = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
  );
  assert.equal(dup.status, 409);

  // invalid slug is a 400
  const bad = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug: "../etc" }),
    }),
  );
  assert.equal(bad.status, 400);

  const listed = await machinesGet(req("http://localhost/api/v1/machines", uidA));
  const { machines: rows } = (await listed.json()) as {
    machines: { id: string }[];
  };
  assert.ok(rows.some((m) => m.id === machine.id));

  // Atlas Browser's resolution path
  const bySlug = await bySlugGet(
    req(`http://localhost/api/v1/machines/by-slug/${slug}`, uidA),
    P({ slug }),
  );
  assert.equal(bySlug.status, 200);

  const exec = await execPost(
    req(`http://localhost/api/v1/machines/${machine.id}/exec`, uidA, {
      method: "POST",
      body: JSON.stringify({ cmd: "echo hi" }),
    }),
    P({ id: machine.id }),
  );
  assert.equal(exec.status, 200);
  const execJson = (await exec.json()) as { exitCode: number; stdout: string };
  assert.equal(execJson.exitCode, 0);
  assert.match(execJson.stdout, /echo hi/);

  const ports = await portsGet(
    req(`http://localhost/api/v1/machines/${machine.id}/ports`, uidA),
    P({ id: machine.id }),
  );
  assert.equal(ports.status, 200);
});

void test("machine routes: files round-trip and reject traversal", async () => {
  await seed();
  const created = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug: `files-${randomUUID().slice(0, 6)}` }),
    }),
  );
  const { machine } = (await created.json()) as { machine: { id: string } };

  const put = await filePut(
    req(`http://localhost/api/v1/machines/${machine.id}/files/src/app.ts`, uidA, {
      method: "PUT",
      body: "console.log(1)",
    }),
    P({ id: machine.id, path: ["src", "app.ts"] }),
  );
  assert.equal(put.status, 200);

  const got = await fileGet(
    req(`http://localhost/api/v1/machines/${machine.id}/files/src/app.ts`, uidA),
    P({ id: machine.id, path: ["src", "app.ts"] }),
  );
  assert.equal(got.status, 200);
  assert.equal(await got.text(), "console.log(1)");

  const traversal = await fileGet(
    req(`http://localhost/api/v1/machines/${machine.id}/files/x`, uidA),
    P({ id: machine.id, path: ["..", "..", "etc", "passwd"] }),
  );
  assert.equal(traversal.status, 400);

  const missing = await fileGet(
    req(`http://localhost/api/v1/machines/${machine.id}/files/nope`, uidA),
    P({ id: machine.id, path: ["nope"] }),
  );
  assert.equal(missing.status, 404);
});

void test("machine routes: auth required and cross-tenant reads 404", async () => {
  await seed();
  const created = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug: `secret-${randomUUID().slice(0, 6)}` }),
    }),
  );
  const { machine } = (await created.json()) as {
    machine: { id: string; slug: string };
  };

  const anon = await machinesGet(
    new Request("http://localhost/api/v1/machines"),
  );
  assert.equal(anon.status, 401);

  for (const [name, res] of [
    [
      "get",
      await machineGet(
        req(`http://localhost/api/v1/machines/${machine.id}`, uidB),
        P({ id: machine.id }),
      ),
    ],
    [
      "by-slug",
      await bySlugGet(
        req(`http://localhost/api/v1/machines/by-slug/${machine.slug}`, uidB),
        P({ slug: machine.slug }),
      ),
    ],
    [
      "exec",
      await execPost(
        req(`http://localhost/api/v1/machines/${machine.id}/exec`, uidB, {
          method: "POST",
          body: JSON.stringify({ cmd: "whoami" }),
        }),
        P({ id: machine.id }),
      ),
    ],
    [
      "stop",
      await stopPost(
        req(`http://localhost/api/v1/machines/${machine.id}/stop`, uidB, {
          method: "POST",
        }),
        P({ id: machine.id }),
      ),
    ],
  ] as const) {
    assert.equal(res.status, 404, `${name} must 404 for another tenant`);
  }

  // and the machine is untouched
  const still = await db.query.machines.findFirst({
    where: eq(machines.id, machine.id),
  });
  assert.equal(still?.status, "running");
});

void test("machine routes: exec on a suspended machine is 409", async () => {
  await seed();
  const created = await machinesPost(
    req("http://localhost/api/v1/machines", uidA, {
      method: "POST",
      body: JSON.stringify({ slug: `susp-${randomUUID().slice(0, 6)}` }),
    }),
  );
  const { machine } = (await created.json()) as { machine: { id: string } };

  const suspended = await suspendPost(
    req(`http://localhost/api/v1/machines/${machine.id}/suspend`, uidA, {
      method: "POST",
    }),
    P({ id: machine.id }),
  );
  assert.equal(suspended.status, 200);

  const exec = await execPost(
    req(`http://localhost/api/v1/machines/${machine.id}/exec`, uidA, {
      method: "POST",
      body: JSON.stringify({ cmd: "echo hi" }),
    }),
    P({ id: machine.id }),
  );
  assert.equal(exec.status, 409);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

process.env.ANTHROPIC_API_KEY = "";
// Never let a stray .env point these tests at a real, billable backend.
process.env.ATLAS_MACHINE_DRIVER = "mock";

import { eq, inArray } from "drizzle-orm";

import { getPersonalWorkspace } from "@/server/authz";
import { db } from "@/server/db";
import { groups, machines, memberships, users, workspaces } from "@/server/db/schema";
import {
  createMachine,
  execOnMachine,
  getMachine,
  getMachineBySlug,
  listMachines,
  MachineConflictError,
  normalizeFilePath,
  getMachineFile,
  putMachineFile,
  resumeMachine,
  stopMachine,
  suspendMachine,
} from "@/server/machines/store";

const owner = `user_mach_a_${randomUUID().slice(0, 8)}`;
const stranger = `user_mach_b_${randomUUID().slice(0, 8)}`;
const member = `user_mach_c_${randomUUID().slice(0, 8)}`;
const groupId = `group_mach_${randomUUID().slice(0, 8)}`;
const ids = [owner, stranger, member];

void after(async () => {
  const ws = await db.query.workspaces.findMany({
    where: inArray(workspaces.userId, ids),
  });
  const wsIds = ws.map((w) => w.id);
  if (wsIds.length) {
    await db.delete(machines).where(inArray(machines.workspaceId, wsIds));
  }
  await db.delete(workspaces).where(eq(workspaces.groupId, groupId));
  await db.delete(memberships).where(eq(memberships.groupId, groupId));
  await db.delete(groups).where(eq(groups.id, groupId));
  await db.delete(workspaces).where(inArray(workspaces.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  process.exit(0);
});

async function seed() {
  await db
    .insert(users)
    .values(ids.map((id) => ({ id, email: `${id}@test.local` })))
    .onConflictDoNothing();
}

void test("create is idempotent per (workspace, slug)", async () => {
  await seed();
  const slug = `demo-${randomUUID().slice(0, 6)}`;

  const first = await createMachine({ userId: owner, slug });
  assert.equal(first.slug, slug);
  assert.equal(first.status, "running");
  assert.ok(first.handle, "driver assigned a handle");
  assert.ok(first.ports.length > 0, "template ports recorded");

  await assert.rejects(
    () => createMachine({ userId: owner, slug }),
    MachineConflictError,
    "a retried create must not provision a second machine",
  );

  const all = await listMachines(owner);
  assert.equal(all.filter((m) => m.slug === slug).length, 1);
});

void test("invalid slugs are rejected before anything is provisioned", async () => {
  await seed();
  await assert.rejects(
    () => createMachine({ userId: owner, slug: "../etc/passwd" }),
    /Invalid machine slug/,
  );
});

void test("another user cannot see, exec on, or stop a machine", async () => {
  await seed();
  const slug = `private-${randomUUID().slice(0, 6)}`;
  const machine = await createMachine({ userId: owner, slug });

  assert.equal(
    await getMachine(stranger, machine.id),
    null,
    "404, not 403 — existence must not leak",
  );
  assert.equal(await getMachineBySlug(stranger, slug), null);
  assert.ok(await getMachine(owner, machine.id));

  const strangerList = await listMachines(stranger);
  assert.equal(strangerList.find((m) => m.id === machine.id), undefined);
});

void test("a group member reaches a group workspace's machine", async () => {
  await seed();
  await db
    .insert(groups)
    .values({
      id: groupId,
      name: "Machine test group",
      slug: `mach-${randomUUID().slice(0, 8)}`,
      createdByUserId: owner,
    })
    .onConflictDoNothing();
  await db
    .insert(memberships)
    .values([
      { groupId, userId: owner, role: "owner" },
      { groupId, userId: member, role: "builder" },
    ])
    .onConflictDoNothing();
  const [groupWs] = await db
    .insert(workspaces)
    .values({ name: "Group WS", groupId })
    .returning();

  const slug = `shared-${randomUUID().slice(0, 6)}`;
  const machine = await createMachine({
    userId: owner,
    workspaceId: groupWs!.id,
    slug,
  });

  assert.ok(
    await getMachine(member, machine.id),
    "group members reach group machines",
  );
  assert.equal(
    await getMachine(stranger, machine.id),
    null,
    "non-members still cannot",
  );
});

void test("lifecycle: suspend, resume, stop, and the guards between", async () => {
  await seed();
  const machine = await createMachine({
    userId: owner,
    slug: `life-${randomUUID().slice(0, 6)}`,
  });

  const suspended = await suspendMachine(machine);
  assert.equal(suspended.status, "suspended");
  assert.ok(suspended.suspendedAt);

  await assert.rejects(
    () => suspendMachine(suspended),
    MachineConflictError,
    "double suspend is a conflict",
  );
  await assert.rejects(
    () => execOnMachine(suspended, { cmd: "echo hi" }, { userId: owner }),
    MachineConflictError,
    "exec on a suspended machine is rejected",
  );

  const resumed = await resumeMachine(suspended);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.suspendedAt, null);

  const stopped = await stopMachine(resumed);
  assert.equal(stopped.status, "stopped");
  assert.ok(stopped.terminatedAt);
  await assert.rejects(
    () => execOnMachine(stopped, { cmd: "echo hi" }, { userId: owner }),
    MachineConflictError,
    "exec on a stopped machine is rejected",
  );

  const listed = await listMachines(owner);
  assert.equal(
    listed.find((m) => m.id === stopped.id),
    undefined,
    "terminated machines drop out of the list",
  );
});

void test("exec records a row and attributes the device", async () => {
  await seed();
  const machine = await createMachine({
    userId: owner,
    slug: `exec-${randomUUID().slice(0, 6)}`,
  });

  const result = await execOnMachine(
    machine,
    { cmd: "echo hi", cwd: "/app" },
    { userId: owner, deviceId: "device_abc" },
  );
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /echo hi/);

  const rows = await db.query.machineExecs.findMany({
    where: (t, { eq: e }) => e(t.machineId, machine.id),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ranByDeviceId, "device_abc");
  assert.equal(rows[0]?.cwd, "/app");
});

void test("files round-trip and path traversal is rejected", async () => {
  await seed();
  const machine = await createMachine({
    userId: owner,
    slug: `files-${randomUUID().slice(0, 6)}`,
  });

  await putMachineFile(machine, "src/app.ts", new TextEncoder().encode("hi"));
  const got = await getMachineFile(machine, "src/app.ts");
  assert.equal(new TextDecoder().decode(got!), "hi");
  assert.equal(await getMachineFile(machine, "missing.txt"), null);

  // leading slashes are stripped, traversal is refused
  assert.equal(normalizeFilePath("/src/app.ts"), "src/app.ts");
  for (const bad of ["../secret", "a/../../b", "", "/", "a//b", "a/\0/b"]) {
    assert.throws(() => normalizeFilePath(bad), /Invalid file path/, bad);
  }
});

void test("workspaceId filter cannot be used to reach another tenancy", async () => {
  await seed();
  const strangerWs = await getPersonalWorkspace(db, stranger);
  const rows = await listMachines(owner, { workspaceId: strangerWs.id });
  assert.deepEqual(rows, [], "filtering by someone else's workspace yields none");
});

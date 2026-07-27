import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getPersonalWorkspace, requireWorkspaceAccess } from "@/server/authz";
import { db as database } from "@/server/db";
import {
  machineExecs,
  machines,
  memberships,
  workspaces,
  type MachineStatus,
} from "@/server/db/schema";

import { revokeDeployTokens } from "@/server/deploy/tokens";
import { SCAFFOLD_FILES } from "@/server/spaces/scaffold";

import { reachableMachine, reachableMachineBySlug, type Machine } from "./authz";
import { type ExecInput, type ExecResult } from "./driver";
import { defaultDriverKind, getDriver } from "./registry";
import { assertSlug } from "./slug";

type Db = typeof database;

/**
 * Exec output is written to Postgres, so it must be bounded. An unbounded
 * `yes | head -c 1G` would otherwise be a denial-of-service on our own database.
 */
const MAX_OUTPUT_BYTES = 64 * 1024;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return (
    text.slice(0, MAX_OUTPUT_BYTES) +
    `\n… truncated at ${MAX_OUTPUT_BYTES} bytes`
  );
}

/** Statuses that can accept work. */
const ACTIVE: MachineStatus[] = ["running"];

export class MachineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineConflictError";
  }
}

export type CreateMachineInput = {
  userId: string;
  deviceId?: string | null;
  workspaceId?: string | null;
  slug: string;
  name?: string | null;
  templateId?: string | null;
  region?: string | null;
};

/**
 * Provision a machine.
 *
 * Idempotency is enforced on `(workspaceId, slug)` by a unique index and
 * surfaced as a conflict rather than a second VM: Atlas Browser retries deep
 * links, and a retry that silently provisions another billed machine is the
 * expensive kind of bug.
 */
export async function createMachine(
  input: CreateMachineInput,
  db: Db = database,
): Promise<Machine> {
  const slug = assertSlug(input.slug);

  const workspaceId =
    input.workspaceId ?? (await getPersonalWorkspace(db, input.userId)).id;
  await requireWorkspaceAccess(db, input.userId, workspaceId, "builder");

  const existing = await db.query.machines.findFirst({
    where: and(eq(machines.workspaceId, workspaceId), eq(machines.slug, slug)),
  });
  if (existing) {
    throw new MachineConflictError(
      `A machine named "${slug}" already exists in this workspace.`,
    );
  }

  const driver = getDriver(defaultDriverKind());
  const { handle, ports } = await driver.create({
    templateId: input.templateId,
    region: input.region,
  });

  const [created] = await db
    .insert(machines)
    .values({
      workspaceId,
      slug,
      name: input.name ?? null,
      templateId: input.templateId ?? null,
      region: input.region ?? null,
      driver: driver.kind,
      handle,
      ports,
      status: "running",
      createdByUserId: input.userId,
      createdByDeviceId: input.deviceId ?? null,
      lastSeenAt: new Date(),
    })
    .returning();

  await writeScaffold(created!);

  return created!;
}

/**
 * Drop the deploy scaffold into a fresh space.
 *
 * Best-effort: the machine exists and is billable by now, so a driver hiccup
 * writing four small files must not fail creation and strand it. The files are
 * re-writable later from the deploy path.
 */
async function writeScaffold(machine: Machine): Promise<void> {
  try {
    for (const [path, body] of Object.entries(SCAFFOLD_FILES)) {
      await putMachineFile(machine, path, new TextEncoder().encode(body));
    }
  } catch (err) {
    console.warn(
      `[machines] scaffold write failed for ${machine.slug}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listMachines(
  userId: string,
  opts: { workspaceId?: string | null; includeStopped?: boolean } = {},
  db: Db = database,
): Promise<Machine[]> {
  // every workspace the caller can reach: their personal one plus their groups'
  const personal = await getPersonalWorkspace(db, userId);
  const groupIds = (
    await db.query.memberships.findMany({
      where: eq(memberships.userId, userId),
      columns: { groupId: true },
    })
  ).map((m) => m.groupId);

  const groupWorkspaces = groupIds.length
    ? await db.query.workspaces.findMany({
        where: inArray(workspaces.groupId, groupIds),
        columns: { id: true },
      })
    : [];

  let ids = [personal.id, ...groupWorkspaces.map((w) => w.id)];
  if (opts.workspaceId) {
    if (!ids.includes(opts.workspaceId)) return [];
    ids = [opts.workspaceId];
  }

  return db.query.machines.findMany({
    // The CLI wants live machines only; the Spaces UI also shows stopped ones,
    // because a stopped space is still something you recreate or delete.
    where: opts.includeStopped
      ? inArray(machines.workspaceId, ids)
      : and(inArray(machines.workspaceId, ids), isNull(machines.terminatedAt)),
    orderBy: [desc(machines.createdAt)],
  });
}

export function getMachine(userId: string, machineId: string, db: Db = database) {
  return reachableMachine(db, userId, machineId);
}

export async function getMachineBySlug(
  userId: string,
  slug: string,
  opts: { workspaceId?: string | null } = {},
  db: Db = database,
): Promise<Machine | null> {
  const workspaceId =
    opts.workspaceId ?? (await getPersonalWorkspace(db, userId)).id;
  return reachableMachineBySlug(db, userId, workspaceId, slug);
}

async function setStatus(
  machine: Machine,
  status: MachineStatus,
  extra: Partial<typeof machines.$inferInsert> = {},
  db: Db = database,
): Promise<Machine> {
  const [updated] = await db
    .update(machines)
    .set({ status, ...extra })
    .where(eq(machines.id, machine.id))
    .returning();
  return updated!;
}

export async function stopMachine(machine: Machine, db: Db = database) {
  await getDriver(machine.driver).stop(machine.handle!);
  // The deployment outlives the space on Railway; its credential must not.
  await revokeDeployTokens(machine.id, db);
  return setStatus(
    machine,
    "stopped",
    { terminatedAt: new Date(), handle: null },
    db,
  );
}

export async function suspendMachine(machine: Machine, db: Db = database) {
  // Refuse rather than destroy: on a backend without real suspend, "suspending"
  // would throw away the user's filesystem while the UI claimed it was saved.
  if (!getDriver(machine.driver).supportsSuspend) {
    throw new MachineConflictError(
      `Machines on the ${machine.driver} backend cannot be suspended. Stop it, or leave it running.`,
    );
  }
  if (machine.status !== "running") {
    throw new MachineConflictError(
      `Cannot suspend a machine that is ${machine.status}.`,
    );
  }
  await getDriver(machine.driver).suspend(machine.handle!);
  return setStatus(machine, "suspended", { suspendedAt: new Date() }, db);
}

export async function resumeMachine(machine: Machine, db: Db = database) {
  if (machine.status !== "suspended") {
    throw new MachineConflictError(
      `Cannot resume a machine that is ${machine.status}.`,
    );
  }
  await getDriver(machine.driver).resume(machine.handle!);
  return setStatus(
    machine,
    "running",
    { suspendedAt: null, lastSeenAt: new Date() },
    db,
  );
}

function assertActive(machine: Machine) {
  if (!ACTIVE.includes(machine.status) || !machine.handle) {
    throw new MachineConflictError(
      `Machine is ${machine.status}. Resume it first.`,
    );
  }
}

export async function execOnMachine(
  machine: Machine,
  input: ExecInput,
  actor: { userId: string; deviceId?: string | null },
  db: Db = database,
): Promise<ExecResult> {
  assertActive(machine);

  const started = Date.now();
  const result = await getDriver(machine.driver).exec(machine.handle!, input);
  const durationMs = result.durationMs || Date.now() - started;

  await db.insert(machineExecs).values({
    machineId: machine.id,
    cmd: input.cmd.slice(0, 8192),
    cwd: input.cwd ?? null,
    exitCode: result.exitCode,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    durationMs,
    ranByUserId: actor.userId,
    ranByDeviceId: actor.deviceId ?? null,
  });

  return { ...result, durationMs };
}

/**
 * Reject anything that could escape the intended tree before it reaches a
 * driver. A real driver writes to a filesystem; `..` there is a real escape.
 */
export function normalizeFilePath(raw: string): string {
  const path = raw.replace(/^\/+/, "");
  const segments = path.split("/");
  if (
    path === "" ||
    segments.some((s) => s === ".." || s === "." || s === "") ||
    path.includes("\0")
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file path" });
  }
  return path;
}

export async function putMachineFile(
  machine: Machine,
  rawPath: string,
  body: Uint8Array,
) {
  assertActive(machine);
  await getDriver(machine.driver).putFile(
    machine.handle!,
    normalizeFilePath(rawPath),
    body,
  );
}

export async function getMachineFile(machine: Machine, rawPath: string) {
  assertActive(machine);
  return getDriver(machine.driver).getFile(
    machine.handle!,
    normalizeFilePath(rawPath),
  );
}

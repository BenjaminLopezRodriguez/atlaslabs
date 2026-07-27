import { and, asc, eq } from "drizzle-orm";

import type { ContentFile } from "@/server/content/merkle";
import { db as database } from "@/server/db";
import { spaceEdits } from "@/server/db/schema";
import type { Machine } from "@/server/machines/authz";
import { putMachineFile } from "@/server/machines/store";
import {
  getSpaceFiles,
  isSpaceStoreConfigured,
  listSpaceCommits,
  putSpaceSnapshot,
} from "@/server/s3/space-store";

type Db = typeof database;

/**
 * Checkpoints for a space, built from the edits it has accepted.
 *
 * The tracked tree is every path the agent has written, at its latest accepted
 * content — not the whole VM filesystem. Walking a real machine to snapshot
 * `node_modules` would cost more than it is worth, and the thing people
 * actually want back is the agent's work, which is exactly this set.
 *
 * ponytail: rebuilds the tree from the full edit history on each snapshot.
 * Fine at thread scale; if a space accumulates thousands of edits, cache the
 * tip tree entries on the machine row instead.
 */

export async function trackedFiles(
  machineId: string,
  db: Db = database,
): Promise<ContentFile[]> {
  const applied = await db.query.spaceEdits.findMany({
    where: and(
      eq(spaceEdits.machineId, machineId),
      eq(spaceEdits.status, "applied"),
    ),
    orderBy: asc(spaceEdits.resolvedAt),
    columns: { path: true, after: true },
  });

  // Later accepts win — the map is the current state of every touched path.
  const latest = new Map<string, string>();
  for (const row of applied) latest.set(row.path, row.after);

  return [...latest].map(([path, contents]) => ({ path, contents }));
}

/**
 * Snapshot the space after an edit lands.
 *
 * Never throws: a checkpoint is a safety net, and failing the user's accepted
 * edit because S3 was unreachable would trade the real work for the backup.
 */
export async function checkpointAfterEdit(input: {
  machine: Machine;
  message?: string | null;
  db?: Db;
}): Promise<{ commitSha: string; persisted: boolean } | null> {
  if (!isSpaceStoreConfigured()) return null;
  try {
    const files = await trackedFiles(input.machine.id, input.db);
    if (!files.length) return null;
    const res = await putSpaceSnapshot({
      workspaceId: input.machine.workspaceId,
      machineId: input.machine.id,
      files,
      message: input.message ?? null,
    });
    return { commitSha: res.commitSha, persisted: res.persisted };
  } catch (err) {
    console.warn(
      `[checkpoints] snapshot failed for ${input.machine.slug}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function listCheckpoints(machine: Machine, limit = 25) {
  return listSpaceCommits({
    workspaceId: machine.workspaceId,
    machineId: machine.id,
    limit,
  });
}

/**
 * Write a checkpoint's files back onto the machine.
 *
 * Restores tracked paths only, and does not delete files added since — this is
 * "put those files back", not a destructive `git checkout`. Anything stronger
 * would silently destroy work the checkpoint never saw.
 */
export async function restoreCheckpoint(input: {
  machine: Machine;
  commitSha: string;
}): Promise<{ restored: string[] }> {
  const files = await getSpaceFiles({
    workspaceId: input.machine.workspaceId,
    machineId: input.machine.id,
    commitSha: input.commitSha,
  });
  if (!files?.length) {
    throw new Error("That checkpoint is not available.");
  }

  const restored: string[] = [];
  for (const file of files) {
    await putMachineFile(
      input.machine,
      file.path,
      new TextEncoder().encode(file.contents),
    );
    restored.push(file.path);
  }
  return { restored };
}

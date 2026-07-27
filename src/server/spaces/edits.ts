import { and, asc, eq } from "drizzle-orm";

import { db as database } from "@/server/db";
import { spaceEdits } from "@/server/db/schema";
import type { Machine } from "@/server/machines/authz";
import { getMachineFile, putMachineFile } from "@/server/machines/store";

type Db = typeof database;

export type ProposedEdit = typeof spaceEdits.$inferSelect;

/**
 * Record a file write for review instead of performing it.
 *
 * The `before` snapshot is taken now, not at apply time: the reviewer approves
 * the diff they were shown, and re-reading the file later could apply their
 * approval to content they never saw.
 */
export async function proposeEdit(
  input: {
    machine: Machine;
    threadId?: string | null;
    path: string;
    after: string;
    userId: string;
  },
  db: Db = database,
): Promise<ProposedEdit> {
  const existing = await getMachineFile(input.machine, input.path);
  const before = existing ? Buffer.from(existing).toString("utf8") : null;

  const [row] = await db
    .insert(spaceEdits)
    .values({
      machineId: input.machine.id,
      threadId: input.threadId ?? null,
      path: input.path,
      before,
      after: input.after,
      proposedByUserId: input.userId,
    })
    .returning();
  return row!;
}

export function listThreadEdits(threadId: string, db: Db = database) {
  return db.query.spaceEdits.findMany({
    where: eq(spaceEdits.threadId, threadId),
    orderBy: asc(spaceEdits.createdAt),
  });
}

export function pendingEdits(machineId: string, db: Db = database) {
  return db.query.spaceEdits.findMany({
    where: and(
      eq(spaceEdits.machineId, machineId),
      eq(spaceEdits.status, "pending"),
    ),
    orderBy: asc(spaceEdits.createdAt),
  });
}

export async function applyEdit(
  edit: ProposedEdit,
  machine: Machine,
  db: Db = database,
): Promise<ProposedEdit> {
  if (edit.status !== "pending") return edit;
  await putMachineFile(
    machine,
    edit.path,
    new TextEncoder().encode(edit.after),
  );
  const [row] = await db
    .update(spaceEdits)
    .set({ status: "applied", resolvedAt: new Date() })
    .where(eq(spaceEdits.id, edit.id))
    .returning();
  return row!;
}

export async function rejectEdit(
  edit: ProposedEdit,
  db: Db = database,
): Promise<ProposedEdit> {
  if (edit.status !== "pending") return edit;
  const [row] = await db
    .update(spaceEdits)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(spaceEdits.id, edit.id))
    .returning();
  return row!;
}

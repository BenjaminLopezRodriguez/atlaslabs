import { eq } from "drizzle-orm";

import { db as database } from "@/server/db";
import { machineIndexes } from "@/server/db/schema";
import type { Machine } from "@/server/machines/authz";
import { execOnMachine } from "@/server/machines/store";
import { shellQuote } from "@/server/shell";

type Db = typeof database;

/**
 * The space's file map.
 *
 * Paths only, refreshed by walking the filesystem — not embeddings. Retrieval
 * here is "which file is this about", and a path list plus grep answers that
 * for a repo-sized tree without a vector store to build, host, and keep in
 * sync with a VM whose files change under us on every command.
 */

/** Enough to describe a real project; past this the prompt cost stops paying. */
const MAX_FILES = 2000;

/** How long an index is trusted before the next prompt rebuilds it. */
const STALE_MS = 5 * 60 * 1000;

const IGNORED = [
  "./.git",
  "*/node_modules/*",
  "*/.next/*",
  "*/dist/*",
  "*/build/*",
  "*/.venv/*",
  "*/__pycache__/*",
];

const FIND = [
  "find . \\(",
  IGNORED.map((p) => `-path ${shellQuote(p)}`).join(" -o "),
  "\\) -prune -o -type f -print",
  `| head -n ${MAX_FILES + 1}`,
].join(" ");

export type SpaceIndex = {
  files: string[];
  truncated: boolean;
  builtAt: Date;
};

export async function buildIndex(
  machine: Machine,
  userId: string,
  db: Db = database,
): Promise<SpaceIndex> {
  const res = await execOnMachine(machine, { cmd: FIND }, { userId });
  const all = res.stdout
    .split("\n")
    .map((l) => l.replace(/^\.\//, "").trim())
    .filter(Boolean);

  const truncated = all.length > MAX_FILES;
  const files = truncated ? all.slice(0, MAX_FILES) : all;
  const builtAt = new Date();

  await db
    .insert(machineIndexes)
    .values({ machineId: machine.id, files, truncated, builtAt })
    .onConflictDoUpdate({
      target: machineIndexes.machineId,
      set: { files, truncated, builtAt },
    });

  return { files, truncated, builtAt };
}

export async function getIndex(
  machineId: string,
  db: Db = database,
): Promise<SpaceIndex | null> {
  const row = await db.query.machineIndexes.findFirst({
    where: eq(machineIndexes.machineId, machineId),
  });
  return row
    ? { files: row.files, truncated: row.truncated, builtAt: row.builtAt }
    : null;
}

/** Cached index, rebuilt when missing or stale. Never throws — the agent works without it. */
export async function ensureIndex(
  machine: Machine,
  userId: string,
  db: Db = database,
): Promise<SpaceIndex | null> {
  try {
    const cached = await getIndex(machine.id, db);
    if (cached && Date.now() - cached.builtAt.getTime() < STALE_MS) {
      return cached;
    }
    return await buildIndex(machine, userId, db);
  } catch {
    return null;
  }
}

/** Grep the space. Used by the agent's `search_code` tool. */
export async function searchSpace(input: {
  machine: Machine;
  userId: string;
  query: string;
  glob?: string | null;
  maxResults?: number;
}): Promise<string> {
  const limit = input.maxResults ?? 60;
  const include = input.glob ? `--include=${shellQuote(input.glob)}` : "";
  const excludes = [
    "--exclude-dir=.git",
    "--exclude-dir=node_modules",
    "--exclude-dir=.next",
    "--exclude-dir=dist",
    "--exclude-dir=build",
    "--exclude-dir=.venv",
  ].join(" ");
  // -F: the model's query is a literal string, not a regex it has to escape.
  const res = await execOnMachine(
    input.machine,
    {
      cmd: `grep -rnIF ${excludes} ${include} -- ${shellQuote(input.query)} . | head -n ${limit}`,
    },
    { userId: input.userId },
  );
  const body = res.stdout.trim();
  if (!body) return `No matches for ${JSON.stringify(input.query)}.`;
  return body;
}

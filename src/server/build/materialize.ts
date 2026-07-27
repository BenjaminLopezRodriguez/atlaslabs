import type { ContentFile } from "@/server/content/merkle";
import type { Machine } from "@/server/machines/authz";
import { getMachineFile } from "@/server/machines/store";
import { ensureIndex } from "@/server/spaces/space-index";
import { SCAFFOLD_FILES } from "@/server/spaces/scaffold";

import { shouldIgnorePath } from "./code-graph";
import type { BuildOrigin } from "./context-pack";

/**
 * The materialize stage: get the workspace into a state the context stage can
 * read, and work out what kind of build this is.
 *
 * manycat materializes into Postgres because its workspaces live in ephemeral
 * sandboxes. Atlas spaces have a real, persistent filesystem, so materializing
 * means *reading* rather than writing — but the stage keeps its job: decide
 * greenfield vs repo, and hand the next stage a bounded set of files.
 */

/** Enough to characterize a project without reading a repo file by file. */
const MAX_FILES = 60;
const MAX_BYTES_PER_FILE = 24 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024;

/** Files that say the most about a project, read first. */
const PRIORITY = [
  "package.json",
  "README.md",
  "app/page.tsx",
  "src/app/page.tsx",
  "pages/index.tsx",
  "src/App.tsx",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
];

const SOURCE_RE = /\.(?:tsx?|jsx?|py|go|rs|rb|java|css|md|json|ya?ml|toml)$/;

/** Scaffold files are ours, not the project's — they must not decide the origin. */
const SCAFFOLD_PATHS = new Set(Object.keys(SCAFFOLD_FILES));

function rank(path: string): number {
  const i = PRIORITY.indexOf(path);
  if (i !== -1) return i;
  // Shallower files describe a project better than deep leaves.
  return PRIORITY.length + path.split("/").length;
}

export type Materialized = {
  origin: BuildOrigin;
  files: ContentFile[];
  /** Every path in the space, scaffold included. */
  allPaths: string[];
  truncated: boolean;
};

/**
 * Decide origin and read a bounded slice of the workspace.
 *
 * Origin is "repo" the moment the space holds project files we did not put
 * there — an imported repo and a half-built greenfield app are the same
 * filesystem, and treating an import as greenfield is how an agent ends up
 * scaffolding over someone's code.
 */
export async function materialize(opts: {
  machine: Machine;
  userId: string;
}): Promise<Materialized> {
  const index = await ensureIndex(opts.machine, opts.userId);
  const allPaths = index?.files ?? [];

  const projectPaths = allPaths.filter(
    (p) => !SCAFFOLD_PATHS.has(p) && !shouldIgnorePath(p),
  );

  const origin: BuildOrigin = projectPaths.length > 0 ? "repo" : "greenfield";

  const readable = projectPaths
    .filter((p) => SOURCE_RE.test(p))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_FILES);

  const files: ContentFile[] = [];
  let budget = MAX_TOTAL_BYTES;

  for (const path of readable) {
    if (budget <= 0) break;
    try {
      const bytes = await getMachineFile(opts.machine, path);
      if (!bytes) continue;
      const contents = Buffer.from(bytes)
        .toString("utf8")
        .slice(0, MAX_BYTES_PER_FILE);
      budget -= contents.length;
      files.push({ path, contents });
    } catch {
      // One unreadable file must not sink the stage.
    }
  }

  return {
    origin,
    files,
    allPaths,
    truncated: readable.length < projectPaths.length || budget <= 0,
  };
}

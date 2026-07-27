import { createHash } from "node:crypto";

/**
 * Content-addressed snapshots of a space's files.
 *
 * Git's object model minus git: blobs hashed by content, a flat tree of
 * path → blob, and commits chaining trees. That is enough to answer "what did
 * this space look like before that edit" and to put it back, without running a
 * git binary on the VM or owning a repo the user did not ask for.
 *
 * Ported from manycat's `src/server/content/merkle.ts`, which has run this
 * layout in production.
 */

export type ContentFile = { path: string; contents: string };

export type MerkleBlob = { sha: string; contents: string };

export type MerkleTree = {
  sha: string;
  /** Flat path → blob sha. Directories are implied by the path, as in a git tree walk. */
  entries: Record<string, string>;
};

export type MerkleCommit = {
  sha: string;
  parent: string | null;
  tree: string;
  /** What the user asked for, when this snapshot came from a prompt. */
  message: string | null;
  createdAt: string;
};

export type MerklePathChange = {
  path: string;
  beforeSha: string | null;
  afterSha: string | null;
};

export function hashBlob(contents: string): string {
  return createHash("sha256").update("blob\0").update(contents).digest("hex");
}

/** Deterministic tree hash over sorted path→sha pairs. */
export function hashTreeEntries(entries: Record<string, string>): string {
  const h = createHash("sha256");
  h.update("tree\0");
  for (const path of Object.keys(entries).sort()) {
    h.update(path);
    h.update("\0");
    h.update(entries[path]!);
    h.update("\0");
  }
  return h.digest("hex");
}

export function hashCommit(input: {
  parent: string | null;
  tree: string;
  message: string | null;
  createdAt: string;
}): string {
  const h = createHash("sha256");
  h.update("commit\0");
  h.update(input.parent ?? "");
  h.update("\0");
  h.update(input.tree);
  h.update("\0");
  h.update(input.message ?? "");
  h.update("\0");
  h.update(input.createdAt);
  return h.digest("hex");
}

export function buildTree(files: ContentFile[] | Record<string, string>): {
  tree: MerkleTree;
  blobs: MerkleBlob[];
} {
  const list = Array.isArray(files)
    ? files
    : Object.entries(files).map(([path, contents]) => ({ path, contents }));

  const entries: Record<string, string> = {};
  const blobs: MerkleBlob[] = [];
  const seen = new Set<string>();

  for (const f of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
    const sha = hashBlob(f.contents);
    entries[f.path] = sha;
    // Identical content is stored once — the whole point of content addressing.
    if (!seen.has(sha)) {
      seen.add(sha);
      blobs.push({ sha, contents: f.contents });
    }
  }

  const sha = hashTreeEntries(entries);
  return { tree: { sha, entries }, blobs };
}

export function diffTrees(
  before: Record<string, string> | null | undefined,
  after: Record<string, string>,
): MerklePathChange[] {
  const prev = before ?? {};
  const paths = new Set([...Object.keys(prev), ...Object.keys(after)]);
  const changes: MerklePathChange[] = [];
  for (const path of [...paths].sort()) {
    const beforeSha = prev[path] ?? null;
    const afterSha = after[path] ?? null;
    if (beforeSha === afterSha) continue;
    changes.push({ path, beforeSha, afterSha });
  }
  return changes;
}

export function filesFromBlobs(
  entries: Record<string, string>,
  blobs: Map<string, string>,
): ContentFile[] {
  const files: ContentFile[] = [];
  for (const [path, sha] of Object.entries(entries)) {
    const contents = blobs.get(sha);
    // A missing blob means a partial fetch; skipping it beats inventing content.
    if (contents == null) continue;
    files.push({ path, contents });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

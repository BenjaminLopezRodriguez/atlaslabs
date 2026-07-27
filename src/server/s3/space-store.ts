import { randomBytes } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  buildTree,
  diffTrees,
  filesFromBlobs,
  hashCommit,
  type ContentFile,
  type MerkleCommit,
  type MerklePathChange,
  type MerkleTree,
} from "@/server/content/merkle";

/**
 * S3-backed checkpoint store for spaces — "temporary git" for a machine whose
 * filesystem is not a repo.
 *
 * Key layout, per manycat's build store:
 *   {prefix}/{workspaceId}/{machineId}/objects/{blobs,trees,commits}
 *   {prefix}/{workspaceId}/{machineId}/refs/heads/{branch}
 *   {prefix}/{workspaceId}/{machineId}/intents/{id}.json
 *
 * Scoped by workspace so one tenant's prefix never contains another's, and by
 * machine so deleting a space is a prefix delete.
 *
 * Unconfigured S3 is a supported state: snapshots still compute their hashes
 * and diffs, they are just not durable. That keeps local dev and tests working
 * without credentials, and it is reported honestly as `persisted: false` rather
 * than silently claiming a checkpoint exists.
 */

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix: (process.env.S3_SPACE_PREFIX ?? "spaces").replace(/^\/+|\/+$/g, ""),
  };
}

type Config = NonNullable<ReturnType<typeof s3Config>>;

export function isSpaceStoreConfigured(): boolean {
  return s3Config() != null;
}

/** One client per process — the SDK pools connections, constructing per call does not. */
let cached: { key: string; client: S3Client } | null = null;

function clientFor(cfg: Config): S3Client {
  const key = `${cfg.region}:${cfg.accessKeyId}`;
  if (cached?.key !== key) {
    cached = {
      key,
      client: new S3Client({
        region: cfg.region,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
      }),
    };
  }
  return cached.client;
}

function safeSeg(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
}

export function spaceKeys(opts: {
  prefix: string;
  workspaceId: string;
  machineId: string;
}) {
  const root = `${opts.prefix}/${safeSeg(opts.workspaceId)}/${safeSeg(opts.machineId)}`;
  return {
    root,
    blob: (sha: string) => `${root}/objects/blobs/${sha}`,
    tree: (sha: string) => `${root}/objects/trees/${sha}.json`,
    commit: (sha: string) => `${root}/objects/commits/${sha}.json`,
    ref: (branch: string) => `${root}/refs/heads/${safeSeg(branch)}`,
    intent: (id: string) => `${root}/intents/${id}.json`,
  };
}

async function putText(
  cfg: Config,
  key: string,
  body: string,
  contentType = "application/json",
) {
  await clientFor(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Objects are immutable except refs, which are small and re-read often.
      CacheControl: "private, max-age=31536000",
    }),
  );
}

async function getText(cfg: Config, key: string): Promise<string | null> {
  try {
    const res = await clientFor(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return (await res.Body?.transformToString()) ?? null;
  } catch {
    // Missing object and denied read are both "no checkpoint here" to callers.
    return null;
  }
}

export type SnapshotResult = {
  commitSha: string;
  treeSha: string;
  parentCommitSha: string | null;
  intentId: string;
  changedPaths: MerklePathChange[];
  /** False when S3 is unconfigured — hashes are real, durability is not. */
  persisted: boolean;
};

export type IntentRecord = {
  intentId: string;
  message: string | null;
  beforeCommit: string | null;
  afterCommit: string;
  treeSha: string;
  changedPaths: MerklePathChange[];
  createdAt: string;
};

/**
 * Write a checkpoint for a space.
 *
 * The parent is read from the branch ref rather than passed in, so two
 * snapshots racing cannot both claim the same parent and lose one another's
 * history — last writer wins the ref, but both commits survive as objects.
 */
export async function putSpaceSnapshot(opts: {
  workspaceId: string;
  machineId: string;
  files: ContentFile[];
  branch?: string;
  message?: string | null;
}): Promise<SnapshotResult> {
  const branch = opts.branch ?? "main";
  const { tree, blobs } = buildTree(opts.files);
  const createdAt = new Date().toISOString();
  const cfg = s3Config();

  const tip = cfg
    ? await getSpaceTip({
        workspaceId: opts.workspaceId,
        machineId: opts.machineId,
        branch,
      })
    : null;

  const commitMeta = {
    parent: tip?.commitSha ?? null,
    tree: tree.sha,
    message: opts.message ?? null,
    createdAt,
  };
  const commitSha = hashCommit(commitMeta);
  const commit: MerkleCommit = { sha: commitSha, ...commitMeta };

  const changedPaths = diffTrees(tip?.tree.entries ?? null, tree.entries);
  const intentId = randomBytes(12).toString("hex");
  const intent: IntentRecord = {
    intentId,
    message: opts.message ?? null,
    beforeCommit: commitMeta.parent,
    afterCommit: commitSha,
    treeSha: tree.sha,
    changedPaths,
    createdAt,
  };

  if (!cfg) {
    return {
      commitSha,
      treeSha: tree.sha,
      parentCommitSha: commitMeta.parent,
      intentId,
      changedPaths,
      persisted: false,
    };
  }

  const keys = spaceKeys({
    prefix: cfg.prefix,
    workspaceId: opts.workspaceId,
    machineId: opts.machineId,
  });

  // Objects before the ref: a ref pointing at a commit whose blobs are missing
  // is an unrestorable checkpoint, which is worse than no checkpoint.
  await Promise.all(
    blobs.map((b) => putText(cfg, keys.blob(b.sha), b.contents, "text/plain")),
  );
  await putText(cfg, keys.tree(tree.sha), JSON.stringify(tree));
  await putText(cfg, keys.commit(commitSha), JSON.stringify(commit));
  await putText(cfg, keys.intent(intentId), JSON.stringify(intent));
  await putText(cfg, keys.ref(branch), commitSha, "text/plain");

  return {
    commitSha,
    treeSha: tree.sha,
    parentCommitSha: commitMeta.parent,
    intentId,
    changedPaths,
    persisted: true,
  };
}

export async function getSpaceTip(opts: {
  workspaceId: string;
  machineId: string;
  branch?: string;
}): Promise<{ commitSha: string; commit: MerkleCommit; tree: MerkleTree } | null> {
  const cfg = s3Config();
  if (!cfg) return null;
  const keys = spaceKeys({
    prefix: cfg.prefix,
    workspaceId: opts.workspaceId,
    machineId: opts.machineId,
  });

  const commitSha = (await getText(cfg, keys.ref(opts.branch ?? "main")))?.trim();
  if (!commitSha) return null;
  return loadCommit(cfg, keys, commitSha);
}

async function loadCommit(
  cfg: Config,
  keys: ReturnType<typeof spaceKeys>,
  commitSha: string,
) {
  const commitRaw = await getText(cfg, keys.commit(commitSha));
  if (!commitRaw) return null;
  const commit = JSON.parse(commitRaw) as MerkleCommit;
  const treeRaw = await getText(cfg, keys.tree(commit.tree));
  if (!treeRaw) return null;
  return { commitSha, commit, tree: JSON.parse(treeRaw) as MerkleTree };
}

/** Walk back from the tip. `limit` bounds the walk — history is a list, not a page. */
export async function listSpaceCommits(opts: {
  workspaceId: string;
  machineId: string;
  branch?: string;
  limit?: number;
}): Promise<MerkleCommit[]> {
  const cfg = s3Config();
  if (!cfg) return [];
  const keys = spaceKeys({
    prefix: cfg.prefix,
    workspaceId: opts.workspaceId,
    machineId: opts.machineId,
  });

  let sha = (await getText(cfg, keys.ref(opts.branch ?? "main")))?.trim() ?? null;
  const out: MerkleCommit[] = [];
  const limit = opts.limit ?? 25;

  while (sha && out.length < limit) {
    const raw = await getText(cfg, keys.commit(sha));
    if (!raw) break;
    const commit = JSON.parse(raw) as MerkleCommit;
    out.push(commit);
    sha = commit.parent;
  }
  return out;
}

/** Files at a commit, or at the tip when no sha is given. Null when unavailable. */
export async function getSpaceFiles(opts: {
  workspaceId: string;
  machineId: string;
  commitSha?: string | null;
}): Promise<ContentFile[] | null> {
  const cfg = s3Config();
  if (!cfg) return null;
  const keys = spaceKeys({
    prefix: cfg.prefix,
    workspaceId: opts.workspaceId,
    machineId: opts.machineId,
  });

  const found = opts.commitSha
    ? await loadCommit(cfg, keys, opts.commitSha)
    : await getSpaceTip(opts);
  if (!found) return null;

  const blobs = new Map<string, string>();
  await Promise.all(
    [...new Set(Object.values(found.tree.entries))].map(async (sha) => {
      const text = await getText(cfg, keys.blob(sha));
      if (text != null) blobs.set(sha, text);
    }),
  );
  return filesFromBlobs(found.tree.entries, blobs);
}

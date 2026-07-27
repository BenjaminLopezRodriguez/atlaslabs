import assert from "node:assert/strict";
import test from "node:test";

import { buildTree, diffTrees, filesFromBlobs, hashCommit } from "./merkle";

const files = (o: Record<string, string>) =>
  Object.entries(o).map(([path, contents]) => ({ path, contents }));

void test("the tree hash is order-independent", () => {
  const a = buildTree(files({ "a.ts": "1", "b.ts": "2" }));
  const b = buildTree(files({ "b.ts": "2", "a.ts": "1" }));
  assert.equal(a.tree.sha, b.tree.sha);
});

void test("changing one byte changes the tree hash", () => {
  const a = buildTree(files({ "a.ts": "1" }));
  const b = buildTree(files({ "a.ts": "2" }));
  assert.notEqual(a.tree.sha, b.tree.sha);
});

void test("identical contents are stored as one blob", () => {
  const { blobs, tree } = buildTree(files({ "a.ts": "same", "b.ts": "same" }));
  assert.equal(blobs.length, 1);
  assert.equal(tree.entries["a.ts"], tree.entries["b.ts"]);
});

void test("diff reports adds, edits, and deletes", () => {
  const before = buildTree(files({ keep: "x", edit: "1", gone: "y" })).tree;
  const after = buildTree(files({ keep: "x", edit: "2", added: "z" })).tree;
  const changes = diffTrees(before.entries, after.entries);

  assert.deepEqual(
    changes.map((c) => [
      c.path,
      c.beforeSha === null ? "add" : c.afterSha === null ? "del" : "edit",
    ]),
    [
      ["added", "add"],
      ["edit", "edit"],
      ["gone", "del"],
    ],
  );
});

void test("a tree round-trips back to its files", () => {
  const input = files({ "a.ts": "one", "dir/b.ts": "two" });
  const { tree, blobs } = buildTree(input);
  const byShaMap = new Map(blobs.map((b) => [b.sha, b.contents]));
  assert.deepEqual(filesFromBlobs(tree.entries, byShaMap), input.sort((x, y) =>
    x.path.localeCompare(y.path),
  ));
});

void test("a commit hash covers its parent, so history cannot be rewritten silently", () => {
  const base = { tree: "t", message: null, createdAt: "2026-01-01T00:00:00Z" };
  assert.notEqual(
    hashCommit({ ...base, parent: null }),
    hashCommit({ ...base, parent: "abc" }),
  );
});

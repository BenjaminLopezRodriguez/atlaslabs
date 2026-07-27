import assert from "node:assert/strict";
import test from "node:test";

import { diffLines } from "./diff";

const text = (lines: string[]) => lines.join("\n");

void test("a new file is all additions", () => {
  const out = diffLines("", "a\nb");
  assert.deepEqual(
    out.map((l) => [l.kind, l.text]),
    [
      ["add", "a"],
      ["add", "b"],
    ],
  );
});

void test("an unchanged file has nothing to review", () => {
  const out = diffLines("a\nb", "a\nb");
  // Every line is context, so the collapse leaves only the elision marker.
  assert.ok(out.every((l) => l.kind === "ctx"));
  assert.equal(out.filter((l) => l.kind !== "ctx").length, 0);
});

void test("a single edit shows one add and one delete", () => {
  const before = text(["one", "two", "three"]);
  const after = text(["one", "TWO", "three"]);
  const out = diffLines(before, after);
  assert.deepEqual(
    out.filter((l) => l.kind === "del").map((l) => l.text),
    ["two"],
  );
  assert.deepEqual(
    out.filter((l) => l.kind === "add").map((l) => l.text),
    ["TWO"],
  );
});

void test("far-apart changes collapse the untouched middle", () => {
  const before = text(["x", ...Array.from({ length: 40 }, (_, i) => `l${i}`), "y"]);
  const after = text(["X", ...Array.from({ length: 40 }, (_, i) => `l${i}`), "Y"]);
  const out = diffLines(before, after);
  assert.ok(
    out.some((l) => l.kind === "ctx" && l.text === "…"),
    "expected an elision between the two changes",
  );
  assert.ok(out.length < 40, "collapsed diff should be far shorter than the file");
});

void test("applying the diff's adds reconstructs the new file", () => {
  const before = text(["a", "b", "c", "d"]);
  const after = text(["a", "c", "d", "e"]);
  const out = diffLines(before, after);
  const rebuilt = out
    .filter((l) => l.kind !== "del" && l.text !== "…")
    .map((l) => l.text);
  assert.deepEqual(rebuilt, ["a", "c", "d", "e"]);
});

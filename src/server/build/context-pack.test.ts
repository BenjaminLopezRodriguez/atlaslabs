import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRunKind,
  emptyContextPack,
  parseContextPack,
  trimContextPack,
} from "./context-pack";

void test("a repo that has never been read must be understood before it is touched", () => {
  const pack = emptyContextPack("repo", "add a settings toggle");
  assert.equal(deriveRunKind(pack), "understand");
});

void test("a repo with a brief modifies", () => {
  const pack = {
    ...emptyContextPack("repo"),
    codebase: {
      summary: "next app",
      stack: ["next"],
      entrypoints: ["app/page.tsx"],
      hotspots: [],
      risks: [],
    },
  };
  assert.equal(deriveRunKind(pack), "modify");
  // No ask means there is nothing to modify — stay in read-only.
  assert.equal(deriveRunKind(pack, { hasUserAsk: false }), "understand");
});

void test("greenfield is oneshot until the first build lands, then modify", () => {
  const pack = emptyContextPack("greenfield", "make a calculator");
  assert.equal(deriveRunKind(pack), "oneshot");
  assert.equal(deriveRunKind({ ...pack, oneshotCompleted: true }), "modify");
});

void test("an explicit run kind always wins", () => {
  const pack = emptyContextPack("repo");
  assert.equal(deriveRunKind(pack, { explicit: "modify" }), "modify");
  assert.equal(deriveRunKind(null, { explicit: "understand" }), "understand");
});

void test("no pack at all is a fresh build", () => {
  assert.equal(deriveRunKind(null), "oneshot");
});

void test("a malformed stored pack is rejected rather than half-read", () => {
  assert.equal(parseContextPack(null), null);
  assert.equal(parseContextPack({ origin: "nonsense" }), null);
  assert.equal(parseContextPack("{}"), null);
});

void test("a pack missing its plan still parses, with an empty plan", () => {
  const pack = parseContextPack({ origin: "greenfield", prompt: "hi" });
  assert.equal(pack?.origin, "greenfield");
  assert.deepEqual(pack?.plan.steps, []);
  assert.equal(pack?.plan.goal, "hi");
});

void test("trimming drops the research chunk dump but keeps the plan", () => {
  const pack = {
    ...emptyContextPack("greenfield", "x"),
    research: {
      prompt: "x",
      queries: ["q"],
      summary: "s",
      chunks: Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        kind: "reference" as const,
        title: "t",
        content: "c",
        sources: [],
      })),
      plan: emptyContextPack("greenfield", "x").plan,
      durationMs: 1,
      provider: "model" as const,
    },
  };
  const trimmed = trimContextPack(pack) as {
    research: { chunks: unknown[] };
    plan: unknown;
  };
  assert.equal(trimmed.research.chunks.length, 6);
  assert.ok(trimmed.plan);
});

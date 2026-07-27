import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGraph,
  routeFromPath,
  shouldIgnorePath,
  sliceGraph,
} from "./code-graph";
import { detectEntrypoints, detectStack } from "./codebase-brief";

const files = (o: Record<string, string>) =>
  Object.entries(o).map(([path, contents]) => ({ path, contents }));

void test("app router paths become routes", () => {
  assert.equal(routeFromPath("app/page.tsx"), "/");
  assert.equal(routeFromPath("src/app/settings/page.tsx"), "/settings");
  // Route groups are organizational, not part of the URL.
  assert.equal(routeFromPath("app/(marketing)/about/page.tsx"), "/about");
  assert.equal(routeFromPath("pages/index.tsx"), "/");
  assert.equal(routeFromPath("lib/utils.ts"), null);
});

void test("vendored and generated trees are ignored", () => {
  assert.ok(shouldIgnorePath("node_modules/react/index.js"));
  assert.ok(shouldIgnorePath("app/.next/build.js"));
  assert.ok(shouldIgnorePath("pnpm-lock.yaml"));
  assert.ok(!shouldIgnorePath("src/app/page.tsx"));
});

void test("relative imports resolve to real files, bare ones to packages", () => {
  const graph = buildGraph(
    files({
      "app/page.tsx":
        'import { Button } from "./button";\nimport React from "react";',
      "app/button.tsx": "export function Button() {}",
    }),
  );
  const edges = graph.edges.filter((e) => e.kind === "imports");
  assert.ok(edges.some((e) => e.to === "file:app/button.tsx"));
  assert.ok(edges.some((e) => e.to === "dependency:react"));
});

void test("exports are classified into components, hooks, and plain exports", () => {
  const graph = buildGraph(
    files({
      "src/x.ts":
        "export function useThing() {}\nexport const Widget = 1;\nexport function helper() {}",
    }),
  );
  const kinds = graph.nodes
    .filter((n) => n.path === "src/x.ts" && n.kind !== "file")
    .map((n) => `${n.kind}:${n.label}`)
    .sort();
  assert.deepEqual(kinds, [
    "component:Widget",
    "export:helper",
    "hook:useThing",
  ]);
});

void test("a slice stays inside its character budget", () => {
  const many = Object.fromEntries(
    Array.from({ length: 200 }, (_, i) => [
      `src/f${i}.ts`,
      `import "./f${(i + 1) % 200}";\nexport function E${i}() {}`,
    ]),
  );
  const graph = buildGraph(files(many));
  const slice = sliceGraph(graph, ["src/f0.ts"], 3, 1_000);
  assert.ok(JSON.stringify(slice).length <= 1_400, "slice blew its budget");
  assert.equal(slice.truncated, true);
});

void test("a slice's edges never dangle outside its nodes", () => {
  const graph = buildGraph(
    files({
      "app/page.tsx": 'import "./a";',
      "app/a.tsx": 'import "./b";',
      "app/b.tsx": "export const b = 1;",
    }),
  );
  const slice = sliceGraph(graph, ["app/page.tsx"], 2);
  const ids = new Set(slice.nodes.map((n) => n.id));
  assert.ok(slice.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
});

void test("stack and entrypoints come from the files, not from a model", () => {
  const project = files({
    "package.json": JSON.stringify({
      dependencies: { next: "15", react: "19" },
      devDependencies: { typescript: "5" },
    }),
    "src/app/page.tsx": "export default function Page() {}",
  });
  assert.deepEqual(detectStack(project).sort(), [
    "next",
    "react",
    "typescript",
  ]);
  assert.ok(detectEntrypoints(project).includes("src/app/page.tsx"));
});

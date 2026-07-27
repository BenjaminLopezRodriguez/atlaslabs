import { createHash } from "node:crypto";

import type { ContentFile } from "@/server/content/merkle";

/**
 * Import graph over a workspace, and a budgeted slice of it for prompts.
 *
 * Ported from manycat's `server/content/code-graph.ts`. Regex extraction, not a
 * parser: the graph answers "what is near this file", and an import statement
 * is unambiguous enough in a regex that a tree-sitter dependency and a WASM
 * build step would buy accuracy nobody would notice.
 *
 * `sliceGraph` is the part that matters — the agent gets structure around the
 * files it is about to touch, bounded by characters, every run.
 */

export type GraphNodeKind =
  "file" | "export" | "route" | "component" | "hook" | "config" | "dependency";

export type GraphEdgeKind =
  "imports" | "exports" | "defines_route" | "depends_on_pkg";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  path?: string;
};

export type GraphEdge = {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
};

export type GraphIndex = {
  pathToNodeIds: Record<string, string[]>;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphSlice = {
  seeds: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: boolean;
};

const IGNORE_SEGMENTS = ["node_modules", ".next", "dist", "build", ".git"];

const DEFAULT_HOPS = 2;
const DEFAULT_BUDGET = 8_000;

export function shouldIgnorePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  for (const seg of IGNORE_SEGMENTS) {
    if (p === seg || p.startsWith(`${seg}/`) || p.includes(`/${seg}/`)) {
      return true;
    }
  }
  const base = p.split("/").pop() ?? p;
  return base.endsWith(".lock") || base.includes("-lock.");
}

function nodeId(kind: GraphNodeKind, key: string): string {
  return `${kind}:${key}`;
}

function edgeId(kind: GraphEdgeKind, from: string, to: string): string {
  return createHash("sha256")
    .update(`${kind}\0${from}\0${to}`)
    .digest("hex")
    .slice(0, 16);
}

/** `useThing` is a hook, `Thing` a component, `thing` a plain export. */
function classifySymbol(name: string): GraphNodeKind {
  if (
    name.startsWith("use") &&
    name.length > 3 &&
    name[3] === name[3]!.toUpperCase()
  ) {
    return "hook";
  }
  if (/^[A-Z]/.test(name)) return "component";
  return "export";
}

const APP_PAGE_RE = /^(?:src\/)?app\/(.+\/)?page\.(?:tsx?|jsx?)$/;
const APP_ROUTE_RE = /^(?:src\/)?app\/(.+\/)?route\.(?:tsx?|jsx?)$/;
const PAGES_RE = /^(?:src\/)?pages\/(.+)\.(?:tsx?|jsx?)$/;

export function routeFromPath(path: string): string | null {
  const p = path.replace(/^\.\//, "");
  const app = APP_PAGE_RE.exec(p) ?? APP_ROUTE_RE.exec(p);
  if (app) {
    const segments = (app[1] ?? "")
      .split("/")
      .filter(Boolean)
      // Route groups like (marketing) are organizational, not part of the URL.
      .filter((s) => !s.startsWith("("));
    return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
  }
  const pages = PAGES_RE.exec(p);
  if (pages) {
    const name = pages[1]!.replace(/\/index$/, "").replace(/^index$/, "");
    return `/${name}`.replace(/\/$/, "") || "/";
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/g;
const EXPORT_RE =
  /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_$]+)/g;

/** Resolve a relative specifier against the importing file, extension-insensitive. */
function resolveRelative(
  from: string,
  spec: string,
  paths: Set<string>,
): string | null {
  const base = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  const joined = base.join("/");
  const candidates = [
    joined,
    ...[".ts", ".tsx", ".js", ".jsx"].flatMap((ext) => [
      `${joined}${ext}`,
      `${joined}/index${ext}`,
    ]),
  ];
  return candidates.find((c) => paths.has(c)) ?? null;
}

export function buildGraph(files: ContentFile[]): GraphIndex {
  const kept = files.filter((f) => !shouldIgnorePath(f.path));
  const paths = new Set(kept.map((f) => f.path.replace(/^\.\//, "")));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  const addNode = (n: GraphNode) => {
    if (seenNodes.has(n.id)) return;
    seenNodes.add(n.id);
    nodes.push(n);
  };
  const addEdge = (kind: GraphEdgeKind, from: string, to: string) => {
    const id = edgeId(kind, from, to);
    if (seenEdges.has(id)) return;
    seenEdges.add(id);
    edges.push({ id, kind, from, to });
  };

  for (const file of kept) {
    const path = file.path.replace(/^\.\//, "");
    const fileId = nodeId("file", path);
    addNode({
      id: fileId,
      kind: "file",
      label: path.split("/").pop() ?? path,
      path,
    });

    const route = routeFromPath(path);
    if (route) {
      const routeId = nodeId("route", route);
      addNode({ id: routeId, kind: "route", label: route, path });
      addEdge("defines_route", fileId, routeId);
    }

    if (path.endsWith("package.json")) {
      const configId = nodeId("config", path);
      addNode({ id: configId, kind: "config", label: "package.json", path });
      try {
        const pkg = JSON.parse(file.contents) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        for (const dep of Object.keys({
          ...pkg.dependencies,
          ...pkg.devDependencies,
        })) {
          const depId = nodeId("dependency", dep);
          addNode({ id: depId, kind: "dependency", label: dep });
          addEdge("depends_on_pkg", configId, depId);
        }
      } catch {
        // A package.json that does not parse is the project's problem, not ours.
      }
      continue;
    }

    if (!/\.(?:tsx?|jsx?)$/.test(path)) continue;

    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(file.contents)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith(".")) {
        const target = resolveRelative(path, spec, paths);
        if (target) addEdge("imports", fileId, nodeId("file", target));
      } else {
        // Bare specifier: attribute to the package, not a file we do not have.
        const pkg = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0]!;
        const depId = nodeId("dependency", pkg);
        addNode({ id: depId, kind: "dependency", label: pkg });
        addEdge("imports", fileId, depId);
      }
    }

    EXPORT_RE.lastIndex = 0;
    while ((m = EXPORT_RE.exec(file.contents)) !== null) {
      const name = m[1]!;
      const kind = classifySymbol(name);
      const symbolId = nodeId(kind, `${path}#${name}`);
      addNode({ id: symbolId, kind, label: name, path });
      addEdge("exports", fileId, symbolId);
    }
  }

  const pathToNodeIds: Record<string, string[]> = {};
  for (const node of nodes) {
    if (!node.path) continue;
    (pathToNodeIds[node.path] ??= []).push(node.id);
  }

  return { pathToNodeIds, nodes, edges };
}

function resolveSeeds(index: GraphIndex, seeds: string[]): string[] {
  const out = new Set<string>();
  for (const seed of seeds) {
    const path = seed.replace(/^\.\//, "");
    for (const id of index.pathToNodeIds[path] ?? []) out.add(id);
    const direct = index.nodes.find((n) => n.id === seed || n.label === seed);
    if (direct) out.add(direct.id);
  }
  return [...out];
}

/**
 * Neighbourhood around the seed files, capped by serialized size.
 *
 * The cap is on characters rather than node count because a prompt budget is
 * measured in tokens, and one dependency node is not the same size as a route.
 */
export function sliceGraph(
  index: GraphIndex,
  seeds: string[],
  hops = DEFAULT_HOPS,
  budgetChars = DEFAULT_BUDGET,
): GraphSlice {
  const seedIds = resolveSeeds(index, seeds);
  const visited = new Set(seedIds);
  let frontier = [...seedIds];

  for (let hop = 0; hop < hops; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of index.edges) {
        if (edge.from === id && !visited.has(edge.to)) {
          visited.add(edge.to);
          next.push(edge.to);
        }
        if (edge.to === id && !visited.has(edge.from)) {
          visited.add(edge.from);
          next.push(edge.from);
        }
      }
    }
    frontier = next;
  }

  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const candidates = [...visited]
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => n != null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const slice: GraphSlice = { seeds, nodes: [], edges: [] };
  let used = JSON.stringify({ seeds }).length;
  let truncated = false;

  for (const node of candidates) {
    const size = JSON.stringify(node).length;
    if (used + size > budgetChars) {
      truncated = true;
      break;
    }
    slice.nodes.push(node);
    used += size;
  }

  const included = new Set(slice.nodes.map((n) => n.id));
  for (const edge of index.edges) {
    if (!included.has(edge.from) || !included.has(edge.to)) continue;
    const size = JSON.stringify(edge).length;
    if (used + size > budgetChars) {
      truncated = true;
      break;
    }
    slice.edges.push(edge);
    used += size;
  }

  if (truncated) slice.truncated = true;
  return slice;
}

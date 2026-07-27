import type { ContentFile } from "@/server/content/merkle";
import { generate } from "@/server/model/gateway";

import { buildGraph, sliceGraph, type GraphIndex } from "./code-graph";
import type { CodebaseBrief } from "./context-pack";
import { fallbackResearchPlan, type ResearchPlan } from "./plan";

/**
 * The understand stage: read an existing project before touching it.
 *
 * Ported from manycat's `server/ai/codebase-brief.ts`. Stack and entrypoints
 * are detected deterministically and the model only writes prose about them —
 * a model that hallucinates `next` into the stack would send every later
 * modify run at the wrong files.
 */

const CANDIDATE_ENTRYPOINTS = [
  "app/page.tsx",
  "app/page.jsx",
  "src/app/page.tsx",
  "src/app/page.jsx",
  "pages/index.tsx",
  "pages/index.jsx",
  "src/pages/index.tsx",
  "src/pages/index.jsx",
  "src/App.tsx",
  "src/App.jsx",
  "src/main.tsx",
  "src/main.jsx",
  "app.py",
  "main.py",
  "package.json",
  "README.md",
];

export function detectEntrypoints(files: ContentFile[]): string[] {
  const paths = new Set(files.map((f) => f.path.replace(/^\.\//, "")));
  const found = CANDIDATE_ENTRYPOINTS.filter((p) => paths.has(p));

  for (const f of files) {
    const p = f.path.replace(/^\.\//, "");
    if (/^(?:src\/)?app\/.+\/page\.tsx$/.test(p) && !found.includes(p)) {
      found.push(p);
    }
    if (found.length >= 10) break;
  }
  if (!found.includes("package.json") && paths.has("package.json")) {
    found.push("package.json");
  }
  return found.length ? found : [...paths].slice(0, 3);
}

export function detectStack(files: ContentFile[]): string[] {
  const stack: string[] = [];
  const pkg = files.find((f) => f.path.replace(/^\.\//, "") === "package.json");

  if (pkg) {
    try {
      const json = JSON.parse(pkg.contents) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...json.dependencies, ...json.devDependencies };
      if (deps.next) stack.push("next");
      if (deps.react) stack.push("react");
      if (deps.vue) stack.push("vue");
      if (deps.svelte) stack.push("svelte");
      if (deps.vite ?? deps["@vitejs/plugin-react"]) stack.push("vite");
      if (deps.express) stack.push("express");
      if (deps.hono) stack.push("hono");
      if (deps.tailwindcss) stack.push("tailwind");
      if (deps.typescript) stack.push("typescript");
    } catch {
      // Unparseable package.json — fall through to path sniffing.
    }
  }

  const paths = files.map((f) => f.path);
  if (paths.some((p) => p.endsWith(".py"))) stack.push("python");
  if (paths.some((p) => /(^|\/)Cargo\.toml$/.test(p))) stack.push("rust");
  if (paths.some((p) => /(^|\/)go\.mod$/.test(p))) stack.push("go");

  return stack.length ? [...new Set(stack)] : ["unknown"];
}

function hotspots(index: GraphIndex, entrypoints: string[]): string[] {
  const out = [...entrypoints];
  for (const node of index.nodes) {
    if (node.kind !== "route" && node.kind !== "component") continue;
    const p = node.path ?? node.label;
    if (p && !out.includes(p)) out.push(p);
    if (out.length >= 12) break;
  }
  return out;
}

const SUMMARY_SYSTEM =
  "You summarize an imported codebase for a coding agent that will make " +
  "minimal diffs. Reply with ONLY JSON: " +
  '{"summary": string (under 120 words), "risks": string[] (max 5)}. ' +
  "Focus on the stack, where the UI lives, and safe edit targets.";

async function summarize(
  hint: string,
  stack: string[],
  entrypoints: string[],
  sliceJson: string,
): Promise<{ summary: string; risks: string[] }> {
  const deterministic = {
    summary: `${stack.join("/")} project. Entrypoints: ${
      entrypoints.slice(0, 5).join(", ") || "unknown"
    }. Prefer minimal diffs; read before edit.`,
    risks: [
      "Do not replace the whole app with a new scaffold.",
      "Confirm entrypoints before editing routes.",
    ],
  };

  try {
    const res = await generate({
      system: SUMMARY_SYSTEM,
      prompt:
        `Repo hint: ${hint}\nStack: ${stack.join(", ")}\n` +
        `Entrypoints: ${entrypoints.join(", ")}\n\nGraph slice:\n${sliceJson.slice(0, 6000)}`,
      maxTokens: 800,
    });
    if (res.stub) return deterministic;

    const match = /\{[\s\S]*\}/.exec(res.text)?.[0];
    if (!match) return deterministic;
    const parsed = JSON.parse(match) as { summary?: string; risks?: unknown };
    return {
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.slice(0, 600)
          : deterministic.summary,
      risks: Array.isArray(parsed.risks)
        ? parsed.risks
            .filter((r): r is string => typeof r === "string")
            .slice(0, 5)
        : deterministic.risks,
    };
  } catch {
    // The brief is a nice-to-have; the detected facts are the load-bearing part.
    return deterministic;
  }
}

/** The plan a modify run follows: read, minimal diff, verify. */
export function modifyPlanFromCodebase(
  brief: CodebaseBrief,
  userAsk?: string,
): ResearchPlan {
  const ask = userAsk?.trim();
  const goal =
    ask && ask.length > 0
      ? ask
      : `Understand and prepare to modify: ${brief.summary.slice(0, 160)}`;

  return {
    ...fallbackResearchPlan(goal, brief.summary, []),
    productRef: brief.stack.join("+"),
    goal: goal.slice(0, 240),
    steps: [
      {
        id: "s0",
        order: 1,
        title: "Read entrypoints and hotspots",
        detail: `Start at: ${brief.entrypoints.slice(0, 4).join(", ") || "package.json"}`,
        harness: "coder",
        targetIds: ["t0"],
      },
      {
        id: "s1",
        order: 2,
        title: "Apply a minimal diff for the ask",
        detail: "Edit existing files; do not scaffold over the project.",
        harness: "coder",
        targetIds: ["t0", "t1"],
      },
      {
        id: "s2",
        order: 3,
        title: "Verify the change",
        detail: "Build or run the affected path when the change is visible.",
        harness: "deploy",
        targetIds: ["t1"],
      },
    ],
  };
}

export async function runCodebaseBrief(opts: {
  files: ContentFile[];
  repoHint: string;
  userAsk?: string;
}): Promise<{ brief: CodebaseBrief; plan: ResearchPlan; graph: GraphIndex }> {
  const graph = buildGraph(opts.files);
  const stack = detectStack(opts.files);
  const entrypoints = detectEntrypoints(opts.files);
  const slice = sliceGraph(graph, entrypoints, 2, 6_000);

  const { summary, risks } = await summarize(
    opts.repoHint,
    stack,
    entrypoints,
    JSON.stringify({ nodes: slice.nodes, edges: slice.edges }),
  );

  const brief: CodebaseBrief = {
    summary,
    stack,
    entrypoints,
    hotspots: hotspots(graph, entrypoints),
    risks,
  };

  return { brief, plan: modifyPlanFromCodebase(brief, opts.userAsk), graph };
}

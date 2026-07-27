/**
 * The plan a build run executes against.
 *
 * Ported from manycat's `server/ai/websearch.ts` type layer. The shape is the
 * contract between stages: research or codebase analysis fills it, the spec
 * stage compresses it into a contract, and the agent's verification checks
 * against its targets. Keeping the shape identical is the point — every stage
 * downstream was written to read exactly this.
 */

export type ResearchSource = {
  title: string;
  url: string;
};

export type ResearchChunk = {
  id: string;
  kind: "identity" | "visual" | "ux" | "reference" | "constraint";
  title: string;
  content: string;
  sources: ResearchSource[];
};

/** Which part of the run owns a target. */
export type HarnessRole = "coder" | "eval" | "deploy" | "browser" | "any";

export type ResearchTarget = {
  id: string;
  harness: HarnessRole;
  kind: "deliverable" | "acceptance" | "visual" | "behavior" | "constraint";
  title: string;
  description: string;
  /** Measurable done-when for the owning role. */
  doneWhen: string;
};

export type ResearchPlanStep = {
  id: string;
  order: number;
  title: string;
  detail: string;
  harness: HarnessRole;
  /** Target ids this step advances. */
  targetIds: string[];
};

export type ResearchPlan = {
  goal: string;
  /** Short product reference, e.g. "Casio-style calculator". */
  productRef: string;
  steps: ResearchPlanStep[];
  targets: ResearchTarget[];
  outOfScope: string[];
};

export type ResearchBrief = {
  prompt: string;
  queries: string[];
  summary: string;
  chunks: ResearchChunk[];
  plan: ResearchPlan;
  durationMs: number;
  /** How the brief was produced. `none` means the model was unavailable. */
  provider: "model" | "none";
};

export function emptyResearchPlan(prompt = ""): ResearchPlan {
  return {
    goal: prompt.trim().slice(0, 200),
    productRef: "",
    steps: [],
    targets: [],
    outOfScope: [],
  };
}

/**
 * A plan good enough to build against when the model gave us nothing usable.
 *
 * Not a placeholder: a run with no plan silently degrades into "do whatever",
 * which is the failure mode the whole pipeline exists to prevent.
 */
export function fallbackResearchPlan(
  prompt: string,
  summary: string,
  chunks: ResearchChunk[],
): ResearchPlan {
  const identityTitle = chunks
    .find((c) => c.kind === "identity")
    ?.title?.slice(0, 80);
  const productRef =
    identityTitle && identityTitle.length > 0
      ? identityTitle
      : prompt
          .replace(/^(make|build|create)\s+(a|an)\s+/i, "")
          .trim()
          .slice(0, 80);

  const visual = chunks
    .filter((c) => c.kind === "visual" || c.kind === "ux")
    .map((c) => c.content.slice(0, 160))
    .join(" ");

  return {
    goal: (prompt || summary).slice(0, 240),
    productRef,
    steps: [
      {
        id: "s0",
        order: 1,
        title: "Build the primary surface",
        detail: visual || "Implement the main screen described by the ask.",
        harness: "coder",
        targetIds: ["t0"],
      },
      {
        id: "s1",
        order: 2,
        title: "Verify it runs",
        detail: "Install, build, and start the app on port 3000.",
        harness: "deploy",
        targetIds: ["t1"],
      },
    ],
    targets: [
      {
        id: "t0",
        harness: "coder",
        kind: "deliverable",
        title: productRef || "Primary surface",
        description: summary.slice(0, 400) || prompt.slice(0, 400),
        doneWhen: "The main screen exists and matches the ask.",
      },
      {
        id: "t1",
        harness: "deploy",
        kind: "acceptance",
        title: "It starts",
        description: "The app builds and serves on port 3000.",
        doneWhen: "A start command runs without error.",
      },
    ],
    outOfScope: [],
  };
}

/** Plan rendered for the agent's prompt. Bounded — this rides in every run. */
export function formatPlanForAgent(plan: ResearchPlan): string {
  const lines: string[] = [];
  if (plan.goal) lines.push(`Goal: ${plan.goal}`);
  if (plan.productRef) lines.push(`Reference: ${plan.productRef}`);
  if (plan.steps.length) {
    lines.push(
      "Steps:",
      ...plan.steps
        .slice(0, 8)
        .map((s) => `  ${s.order}. [${s.harness}] ${s.title} — ${s.detail}`),
    );
  }
  if (plan.targets.length) {
    lines.push(
      "Done when:",
      ...plan.targets.slice(0, 8).map((t) => `  - ${t.title}: ${t.doneWhen}`),
    );
  }
  if (plan.outOfScope.length) {
    lines.push(`Out of scope: ${plan.outOfScope.slice(0, 6).join("; ")}`);
  }
  return lines.join("\n");
}

export function formatBriefForAgent(brief: ResearchBrief): string {
  const parts = [`# Research\n${brief.summary}`];
  for (const chunk of brief.chunks.slice(0, 6)) {
    parts.push(`## ${chunk.title} (${chunk.kind})\n${chunk.content}`);
  }
  parts.push(formatPlanForAgent(brief.plan));
  return parts.filter(Boolean).join("\n\n");
}

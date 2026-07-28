import { db as database } from "@/server/db";
import type { Machine } from "@/server/machines/authz";
import {
  runSpaceAgent,
  type AgentResult,
  type OnProgress,
  type Progress,
} from "@/server/spaces/agent";

import { buildGraph, sliceGraph } from "./code-graph";
import {
  deriveRunKind,
  emptyContextPack,
  loadContextPack,
  saveContextPack,
  type ContextPack,
  type RunKind,
} from "./context-pack";
import { detectEntrypoints, runCodebaseBrief } from "./codebase-brief";
import { materialize } from "./materialize";
import { formatBriefForAgent, formatPlanForAgent } from "./plan";
import { runResearchBrief } from "./research";
import { synthesizeBuildSpec } from "./spec";

type Db = typeof database;

/**
 * The build pipeline, end to end:
 *
 *   Materialize (detect origin, read workspace)
 *     → Context   (research brief | codebase brief + graph)
 *     → Spec      (build contract)
 *     → Code      (agent run, gated by run kind)
 *
 * Ported from manycat's `runAgent` in `server/api/routers/workflow.ts`. The
 * ordering is the product: a prompt that skips straight to code is how an
 * agent ends up scaffolding over an imported repo, or building the wrong thing
 * confidently.
 */

export type BuildTurn = {
  runKind: RunKind;
  pack: ContextPack;
  /** Null on an understand turn — nothing was run against the machine. */
  agent: AgentResult | null;
  /** What to post in the thread. */
  text: string;
};

/** Understand replies with the brief itself; there is no agent run to report. */
function understandReply(pack: ContextPack): string {
  if (!pack.codebase) {
    return "I mapped the space. Tell me what you want changed.";
  }
  const entrypoints = pack.codebase.entrypoints.slice(0, 6).join(", ") || "—";
  return [
    pack.codebase.summary,
    "",
    `**Stack** ${pack.codebase.stack.join(", ")}`,
    `**Entrypoints** ${entrypoints}`,
    pack.codebase.risks.length
      ? `**Watch out** ${pack.codebase.risks.join("; ")}`
      : "",
    "",
    "Ready when you are — tell me what to change.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runBuildTurn(input: {
  machine: Machine;
  threadId: string;
  userAsk: string;
  userId: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Force a stage. Omit and it is derived from the pack. */
  runKind?: RunKind;
  db?: Db;
  /** Called at every stage boundary so a caller can surface live progress. */
  onProgress?: OnProgress;
  /** Called with the reply text so far, as the agent writes it. */
  onReplyText?: (text: string) => void;
}): Promise<BuildTurn> {
  const db = input.db ?? database;
  const progress = stampElapsed(input.onProgress);

  // —— Materialize ——
  await progress({ phase: "reading", detail: "Reading the space" });
  const workspace = await materialize({
    machine: input.machine,
    userId: input.userId,
  });

  let pack =
    (await loadContextPack(input.threadId, db)) ??
    emptyContextPack(workspace.origin, input.userAsk);

  // A space that gained a repo after the pack was written is a repo now.
  if (
    pack.origin === "greenfield" &&
    workspace.origin === "repo" &&
    !pack.oneshotCompleted
  ) {
    pack = { ...pack, origin: "repo" };
  }

  const runKind = deriveRunKind(pack, {
    explicit: input.runKind,
    hasUserAsk: Boolean(input.userAsk.trim()),
  });

  // —— Context ——
  if (runKind === "understand" || (pack.origin === "repo" && !pack.codebase)) {
    await progress({ phase: "reading", detail: "Summarizing the codebase" });
    try {
      const cb = await runCodebaseBrief({
        files: workspace.files,
        repoHint: pack.prompt ?? input.machine.slug,
        userAsk: runKind === "modify" ? input.userAsk : undefined,
      });
      pack = { ...pack, origin: "repo", codebase: cb.brief, plan: cb.plan };
      await saveContextPack(input.threadId, pack, db);
    } catch (err) {
      console.warn(
        "[build] codebase brief failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (
    runKind === "oneshot" ||
    (pack.origin === "greenfield" && !pack.research)
  ) {
    await progress({ phase: "research", detail: "Researching the ask" });
    const research = await runResearchBrief({
      prompt: pack.prompt ?? input.userAsk,
    }).catch(() => null);
    if (research && research.provider !== "none") {
      pack = {
        ...pack,
        origin: "greenfield",
        research,
        plan: research.plan,
        prompt: pack.prompt ?? input.userAsk,
      };
      await saveContextPack(input.threadId, pack, db);
    }
  }

  // Understand stops here on purpose: it is the read-only stage, and running
  // the agent with tools would defeat the point of having one.
  if (runKind === "understand") {
    return { runKind, pack, agent: null, text: understandReply(pack) };
  }

  // —— Spec ——
  await progress({ phase: "planning", detail: "Writing the build contract" });
  const buildContract = await synthesizeBuildSpec({
    userAsk: input.userAsk,
    pack,
    runKind,
  });
  pack = { ...pack, buildContract, prompt: pack.prompt ?? input.userAsk };
  await saveContextPack(input.threadId, pack, db);

  // —— Code ——
  const contextPrefix = [
    pack.research
      ? formatBriefForAgent(pack.research)
      : pack.codebase
        ? [
            "# Codebase",
            pack.codebase.summary,
            `Stack: ${pack.codebase.stack.join(", ")}`,
            `Entrypoints: ${pack.codebase.entrypoints.slice(0, 6).join(", ")}`,
            formatPlanForAgent(pack.plan),
          ].join("\n")
        : "",
    graphSlice(workspace.files, pack.codebase?.entrypoints),
  ]
    .filter(Boolean)
    .join("\n\n");

  await progress({ phase: "building", detail: "Starting work" });
  const agent = await runSpaceAgent({
    machine: input.machine,
    onProgress: progress,
    onReplyText: input.onReplyText,
    threadId: input.threadId,
    prompt: input.userAsk,
    history: input.history,
    userId: input.userId,
    runKind,
    contract: buildContract,
    context: contextPrefix || undefined,
  });

  // A oneshot that proposed nothing did not complete; leaving the flag unset
  // keeps the next turn in oneshot rather than demoting it to modify.
  if (runKind === "oneshot" && agent.edits.length > 0) {
    pack = { ...pack, oneshotCompleted: true };
    await saveContextPack(input.threadId, pack, db);
  }

  return { runKind, pack, agent, text: agent.text };
}

/** Budgeted repo map for the prompt. Best-effort — a graph is not the ask. */
function graphSlice(
  files: { path: string; contents: string }[],
  entrypoints?: string[],
): string {
  if (!files.length) return "";
  try {
    const index = buildGraph(files);
    const seeds = entrypoints?.length ? entrypoints : detectEntrypoints(files);
    const slice = sliceGraph(index, seeds, 2, 8_000);
    if (!slice.nodes.length) return "";
    return [
      "Code graph slice (budgeted; search_code for the rest):",
      "```json",
      JSON.stringify({
        seeds: slice.seeds,
        nodes: slice.nodes.slice(0, 40),
        edges: slice.edges.slice(0, 60),
      }),
      "```",
    ].join("\n");
  } catch {
    return "";
  }
}

/**
 * Wrap a progress callback so every event carries its offset from the start of
 * the turn.
 *
 * The clock starts when the turn does, and the agent's per-tool events go
 * through the same wrapper — two clocks would make the stage timings and the
 * tool timings impossible to line up.
 */
function stampElapsed(onProgress?: OnProgress): (p: Progress) => Promise<void> {
  const startedAt = Date.now();
  return async (p: Progress) => {
    await onProgress?.({ ...p, elapsedMs: Date.now() - startedAt });
  };
}

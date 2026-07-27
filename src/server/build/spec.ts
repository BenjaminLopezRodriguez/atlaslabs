import { generate } from "@/server/model/gateway";

import type { ContextPack, RunKind } from "./context-pack";

/**
 * The spec stage: compress everything known about the build into one contract.
 *
 * Ported from manycat's `server/ai/structure-prompt.ts` (`synthesizeBuildSpec`).
 * The contract, not the raw prompt, is what the agent is given — a one-line ask
 * plus a wall of research reads as "here is some context, do something",
 * whereas a contract reads as an instruction with acceptance criteria.
 */

const MODIFY_SYSTEM =
  "You write a short MODIFY contract for a coding agent working on an " +
  "EXISTING project. Ground every instruction in the codebase summary. " +
  "Require minimal diffs. Forbid replacing the project with a new scaffold. " +
  "Under 180 words. Output only the contract.";

const ONESHOT_SYSTEM =
  "You write a short ONE-SHOT build contract for a coding agent. Ground " +
  "visual and UX requirements in the research. List concrete UI facts and " +
  "acceptance targets. Under 180 words. Output only the contract.";

/** Deterministic contract, used when the model is unavailable or unusable. */
function fallbackContract(userAsk: string, pack: ContextPack): string {
  const lines = [`User ask: ${userAsk}`];

  if (pack.origin === "greenfield" && pack.research?.summary) {
    lines.push(`Research: ${pack.research.summary}`);
    if (pack.plan.productRef) lines.push(`Reference: ${pack.plan.productRef}`);
    const targets = pack.plan.targets.slice(0, 4);
    if (targets.length) {
      lines.push(
        "Targets:\n" +
          targets
            .map((t) => `- ${t.id}: ${t.title} (${t.doneWhen})`)
            .join("\n"),
      );
    }
    lines.push(
      "First action: write the app's main page with a complete working UI.",
    );
  } else if (pack.origin === "repo" && pack.codebase) {
    lines.push(`Codebase: ${pack.codebase.summary}`);
    lines.push(`Stack: ${pack.codebase.stack.join(", ")}`);
    lines.push(
      `Entrypoints: ${pack.codebase.entrypoints.slice(0, 6).join(", ")}`,
    );
    lines.push(
      "Apply a minimal diff. Do not replace the project with a new scaffold.",
    );
  } else if (pack.plan.goal) {
    lines.push(`Goal: ${pack.plan.goal}`);
  }

  return lines.join("\n");
}

export async function synthesizeBuildSpec(opts: {
  userAsk: string;
  pack: ContextPack;
  runKind: RunKind;
}): Promise<string> {
  const { userAsk, pack, runKind } = opts;

  // Understand never writes, so it needs a description, not a contract.
  if (runKind === "understand") {
    return (
      pack.codebase?.summary ??
      pack.research?.summary ??
      `Mapped the workspace for this ${pack.origin} build.`
    );
  }

  const researchBlock = pack.research
    ? `Research summary:\n${pack.research.summary}\n` +
      `Queries: ${pack.research.queries.join(" · ")}\n` +
      `Goal: ${pack.plan.goal}\n` +
      `Reference: ${pack.plan.productRef}\n` +
      `Targets:\n${pack.plan.targets
        .slice(0, 6)
        .map((t) => `- [${t.harness}] ${t.title}: ${t.doneWhen}`)
        .join("\n")}\n`
    : "";

  const codebaseBlock = pack.codebase
    ? `Codebase summary:\n${pack.codebase.summary}\n` +
      `Stack: ${pack.codebase.stack.join(", ")}\n` +
      `Entrypoints: ${pack.codebase.entrypoints.join(", ")}\n` +
      `Hotspots: ${pack.codebase.hotspots.slice(0, 8).join(", ")}\n` +
      `Risks: ${pack.codebase.risks.join("; ")}\n`
    : "";

  try {
    const res = await generate({
      system:
        pack.origin === "repo" || runKind === "modify"
          ? MODIFY_SYSTEM
          : ONESHOT_SYSTEM,
      prompt:
        `Run kind: ${runKind}\nOrigin: ${pack.origin}\n\n` +
        `User ask:\n${userAsk}\n\n` +
        researchBlock +
        codebaseBlock,
      maxTokens: 700,
    });
    if (!res.stub && res.text.trim()) return res.text.trim().slice(0, 1800);
  } catch {
    // Fall through — a build with no contract is worse than a blunt one.
  }

  return fallbackContract(userAsk, pack);
}

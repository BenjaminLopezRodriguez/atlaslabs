import { Compass, Hammer, PencilRuler } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Which stage of the build a reply came from.
 *
 * Cheap to render and easy to skim — the thread already carries the plan and
 * the diffs, so this only has to answer "was that a read, a build, or an edit",
 * which is the question people ask when an agent surprises them.
 */

export type BuildStageMeta = {
  runKind?: "oneshot" | "understand" | "modify";
  origin?: "greenfield" | "repo";
  productRef?: string;
};

const STAGE = {
  understand: {
    icon: Compass,
    label: "Read the project",
    tone: "text-signal",
  },
  oneshot: {
    icon: Hammer,
    label: "Built it",
    tone: "text-foreground",
  },
  modify: {
    icon: PencilRuler,
    label: "Edited the project",
    tone: "text-foreground",
  },
} as const;

export function BuildStage({ meta }: { meta: BuildStageMeta }) {
  const stage = meta.runKind ? STAGE[meta.runKind] : null;
  if (!stage) return null;
  const Icon = stage.icon;

  return (
    <p className="text-muted-foreground mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-widest uppercase">
      <Icon className={cn("size-3", stage.tone)} aria-hidden="true" />
      {stage.label}
      {meta.productRef ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate normal-case">{meta.productRef}</span>
        </>
      ) : null}
    </p>
  );
}

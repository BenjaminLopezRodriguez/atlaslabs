import { Check, Circle } from "lucide-react";

export type PlanStep = { title: string; status: "pending" | "done" };

/**
 * The checklist the agent committed to, with what it actually finished.
 * Pending steps are shown, not hidden: a run that stopped halfway should look
 * like it stopped halfway.
 */
export function AgentPlan({ steps }: { steps: PlanStep[] }) {
  if (!steps.length) return null;
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <div className="border-border mt-3 rounded-xl border p-3">
      <p className="text-muted-foreground font-mono text-[11px] tracking-widest uppercase">
        Plan · {done}/{steps.length}
      </p>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step, i) => (
          <li key={`${i}-${step.title}`} className="flex items-start gap-2">
            {step.status === "done" ? (
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <span
              className={
                step.status === "done"
                  ? "text-muted-foreground text-[13px] leading-snug line-through"
                  : "text-foreground text-[13px] leading-snug"
              }
            >
              {step.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { FEATURES_HEADER, FEATURES_SUBHEADER_DESC } from "@/app/_constants/constants";
import { GradientCard } from "./gradient-card";

const features = [
  {
    id: "for-data",
    title: "Spaces that stay up",
    description:
      "Every project gets a cloud machine with a persistent filesystem and shell. Close the tab, come back tomorrow, and your work is exactly where you left it.",
    span: "md:col-span-2 md:min-h-[260px]",
  },
  {
    id: "for-agents",
    title: "Agents edit real files",
    description:
      "Prompt from the chat and the agent writes to the space itself — not a sandbox copy you have to reconcile later.",
    span: "md:col-span-1 md:min-h-[260px]",
  },
  {
    title: "Browser or terminal",
    description:
      "Drive a space from the web app or the Atlas CLI. Same machine, same files, whichever one you have open.",
    span: "md:col-span-1 md:min-h-[220px]",
  },
  {
    title: "Ship from the same box",
    description:
      "Run the dev server, expose a port, and share a public URL. What the agent built is live without a deploy step in between.",
    span: "md:col-span-2 md:min-h-[220px]",
  },
];

export function Features() {
  return (
    <section
      id="product"
      aria-labelledby="product-h"
      className="mm-section border-border scroll-mt-14 border-t"
    >
      <div className="mm-shell">
        <div className="max-w-2xl">
          <h2 id="product-h" className="mm-title text-foreground">
            { FEATURES_HEADER }
          </h2>
          <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
            { FEATURES_SUBHEADER_DESC}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3">
          {features.map((feature) => (
            <GradientCard
              key={feature.title}
              id={feature.id}
              seed={feature.title}
              className={`flex flex-col justify-end rounded-lg p-6 sm:p-7 ${feature.span}`}
            >
              <h3 className="text-xl leading-snug font-medium tracking-tight text-balance text-white">
                {feature.title}
              </h3>
              <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-white/75">
                {feature.description}
              </p>
            </GradientCard>
          ))}
        </div>
      </div>
    </section>
  );
}

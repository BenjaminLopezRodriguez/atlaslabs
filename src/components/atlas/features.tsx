import { FEATURES_HEADER, FEATURES_SUBHEADER_DESC } from "@/app/_constants/constants";
import { GradientCard } from "./gradient-card";

const features = [
  {
    id: "for-data",
    title: "Data marketplace",
    description:
      "Discover, license, and deliver datasets with clear provenance, pricing, and usage terms — from niche corpora to production-ready feeds.",
    span: "md:col-span-2 md:min-h-[260px]",
  },
  {
    id: "for-agents",
    title: "Specialist agents",
    description:
      "Hire agents trained for a job — legal review, sales research, support triage, and more — not generic chat.",
    span: "md:col-span-1 md:min-h-[260px]",
  },
  {
    title: "Publish and earn",
    description:
      "List your datasets and agents. Set terms, track usage, and get paid when buyers put your work to use.",
    span: "md:col-span-1 md:min-h-[220px]",
  },
  {
    title: "Compose into workflows",
    description:
      "Connect data and agents through APIs and tools you already use. Swap specialists without rebuilding your stack.",
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

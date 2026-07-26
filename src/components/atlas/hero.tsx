import { Button } from "@/components/ui/button";
import { Database, Bot } from "lucide-react";

const previewListings = [
  {
    label: "Retail foot-traffic feed",
    kind: "Dataset",
    icon: Database,
    meta: "Licensed · Hourly",
  },
  {
    label: "Contract review agent",
    kind: "Agent",
    icon: Bot,
    meta: "Legal · Redlines",
  },
  {
    label: "Supply-chain event stream",
    kind: "Dataset",
    icon: Database,
    meta: "API · Enterprise",
  },
  {
    label: "Account research agent",
    kind: "Agent",
    icon: Bot,
    meta: "Sales · Briefs",
  },
];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-h"
      className="mm-atmosphere relative overflow-hidden pt-12"
    >
      <div className="mm-shell relative grid gap-10 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div>
          <p className="animate-mm mm-display text-foreground">Atlas</p>

          <h1
            id="hero-h"
            className="animate-mm animate-delay-100 mt-5 max-w-md text-xl leading-snug tracking-tight text-foreground/90 sm:text-2xl"
          >
            The marketplace for data and specialist agents.
          </h1>

          <p className="animate-mm animate-delay-200 mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Buy and sell datasets, and hire agents built for specific work —
            research, ops, support, and domain expertise you can plug into your
            stack.
          </p>

          <div className="animate-mm animate-delay-300 mt-8 flex flex-wrap items-center gap-2.5">
            <Button
              className="h-9 rounded-md px-3.5 text-[13px] font-medium shadow-xs"
              render={<a href="#waitlist" />}
            >
              Request access
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-md border-border bg-card px-3.5 text-[13px] font-medium shadow-none"
              render={<a href="#product" />}
            >
              Explore marketplace
            </Button>
          </div>
        </div>

        {/* Terminal-style product panel — minimachines cue */}
        <div className="animate-mm animate-delay-200 relative overflow-hidden rounded-lg border border-border bg-[#141414] text-[#ededed] shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_18px_50px_-28px_rgb(0_0_0/0.55)]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="size-1.5 rounded-full bg-foreground/25" />
            <span className="size-1.5 rounded-full bg-foreground/25" />
            <span className="size-1.5 rounded-full bg-foreground/25" />
            <span className="ml-2 font-mono text-[11px] text-white/40">
              atlas · marketplace
            </span>
          </div>

          <ul className="divide-y divide-white/10">
            {previewListings.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-4 px-4 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <item.icon className="size-3.5 shrink-0 text-white/35" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium tracking-tight">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-white/40">{item.meta}</p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-signal">
                  {item.kind}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Database, Bot } from "lucide-react";

import { cn } from "@/lib/utils";

type Mode = "data" | "agents";

interface Listing {
  label: string;
  kind: "dataset" | "agent";
  kindLabel: string;
  detail: string;
}

const dataListings: Listing[] = [
  {
    label: "Retail foot-traffic feed",
    kind: "dataset",
    kindLabel: "Dataset",
    detail: "Geocoded, hourly · Licensed",
  },
  {
    label: "Clinical trial abstracts",
    kind: "dataset",
    kindLabel: "Dataset",
    detail: "Curated corpus · Research use",
  },
  {
    label: "Supply-chain event stream",
    kind: "dataset",
    kindLabel: "Dataset",
    detail: "Real-time API · Enterprise",
  },
  {
    label: "Brand sentiment archive",
    kind: "dataset",
    kindLabel: "Dataset",
    detail: "Multi-language · Quarterly",
  },
];

const agentListings: Listing[] = [
  {
    label: "Contract review agent",
    kind: "agent",
    kindLabel: "Agent",
    detail: "Legal · Redlines + risk flags",
  },
  {
    label: "Account research agent",
    kind: "agent",
    kindLabel: "Agent",
    detail: "Sales · Briefs in under 2 min",
  },
  {
    label: "Support triage agent",
    kind: "agent",
    kindLabel: "Agent",
    detail: "Ops · Routes + drafts replies",
  },
  {
    label: "Compliance monitor",
    kind: "agent",
    kindLabel: "Agent",
    detail: "Risk · Policy drift alerts",
  },
];

const steps = [
  {
    title: "Browse",
    body: "Search datasets and specialist agents by domain, format, and terms — with clear provenance and pricing.",
  },
  {
    title: "License",
    body: "Buy access with usage rights you can trust. Creators set the terms; Atlas handles delivery and metering.",
  },
  {
    title: "Connect",
    body: "Pull data via API or drop agents into your workflows. Swap specialists without rebuilding the stack.",
  },
  {
    title: "Publish",
    body: "List your own datasets and agents. Reach buyers, track usage, and earn when your work gets used.",
  },
];

const kindIcons = {
  dataset: Database,
  agent: Bot,
};

export function HowItWorks() {
  const [mode, setMode] = useState<Mode>("data");
  const listings = mode === "data" ? dataListings : agentListings;

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-h"
      className="mm-section border-border scroll-mt-14 border-t"
    >
      <div className="mm-shell">
        <div className="max-w-2xl">
          <h2 id="how-h" className="mm-title text-foreground">
            From listing to workflow.
          </h2>
        </div>

        {/* Divided feature rows — minimachines cue */}
        <div className="divide-border border-border mt-14 divide-y border-y">
          {steps.map((step) => (
            <article key={step.title} className="py-8">
              <h3 className="text-foreground text-[15px] font-medium tracking-tight">
                {step.title}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                {step.body}
              </p>
            </article>
          ))}
        </div>

        <div className="border-border bg-card mt-14 overflow-hidden rounded-lg border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="bg-foreground/25 size-1.5 rounded-full" />
              <span className="bg-foreground/25 size-1.5 rounded-full" />
              <span className="bg-foreground/25 size-1.5 rounded-full" />
              <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                listings
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Listing type"
              className="bg-muted flex items-center gap-0.5 rounded-md p-0.5"
            >
              {(
                [
                  ["data", "Data"],
                  ["agents", "Agents"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                    mode === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-border divide-y">
            {listings.map((listing) => {
              const KindIcon = kindIcons[listing.kind];
              return (
                <li
                  key={`${mode}-${listing.label}`}
                  className="flex items-start justify-between gap-4 px-4 py-3.5"
                >
                  <div>
                    <p className="text-foreground text-[13px] font-medium tracking-tight">
                      {listing.label}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[12px]">
                      {listing.detail}
                    </p>
                  </div>
                  <span className="text-signal inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
                    <KindIcon className="size-3" />
                    {listing.kindLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

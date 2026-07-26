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
    index: "01",
    title: "Browse",
    body: "Search datasets and specialist agents by domain, format, and terms — with clear provenance and pricing.",
  },
  {
    index: "02",
    title: "License",
    body: "Buy access with usage rights you can trust. Creators set the terms; Atlas handles delivery and metering.",
  },
  {
    index: "03",
    title: "Connect",
    body: "Pull data via API or drop agents into your workflows. Swap specialists without rebuilding the stack.",
  },
  {
    index: "04",
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
      className="mm-section scroll-mt-14 border-t border-border"
    >
      <div className="mm-shell">
        <div className="max-w-2xl">
          <p className="text-[13px] font-medium tracking-tight text-signal">
            How it works
          </p>
          <h2 id="how-h" className="mm-title mt-3 text-foreground">
            From listing to workflow.
          </h2>
        </div>

        {/* Divided feature rows — minimachines cue */}
        <div className="mt-14 divide-y divide-border border-y border-border">
          {steps.map((step) => (
            <article
              key={step.index}
              className="grid gap-3 py-8 sm:grid-cols-[5rem_1fr] sm:gap-8"
            >
              <span className="font-mono text-[12px] tracking-tight text-muted-foreground">
                {step.index}
              </span>
              <div>
                <h3 className="text-[15px] font-medium tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-14 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground/25" />
              <span className="size-1.5 rounded-full bg-foreground/25" />
              <span className="size-1.5 rounded-full bg-foreground/25" />
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                listings
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Listing type"
              className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
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

          <ul className="divide-y divide-border">
            {listings.map((listing) => {
              const KindIcon = kindIcons[listing.kind];
              return (
                <li
                  key={`${mode}-${listing.label}`}
                  className="flex items-start justify-between gap-4 px-4 py-3.5"
                >
                  <div>
                    <p className="text-[13px] font-medium tracking-tight text-foreground">
                      {listing.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {listing.detail}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-signal">
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

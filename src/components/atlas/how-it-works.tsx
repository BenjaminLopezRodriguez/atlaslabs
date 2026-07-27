"use client";

import { useState } from "react";
import { Cpu, Bot } from "lucide-react";

import { cn } from "@/lib/utils";

type Mode = "spaces" | "agents";

interface Listing {
  label: string;
  kind: "space" | "agent";
  kindLabel: string;
  detail: string;
}

const spaceListings: Listing[] = [
  {
    label: "checkout-rewrite",
    kind: "space",
    kindLabel: "Space",
    detail: "Running · dev server on :3000",
  },
  {
    label: "docs-site",
    kind: "space",
    kindLabel: "Space",
    detail: "Running · public URL live",
  },
  {
    label: "api-migration",
    kind: "space",
    kindLabel: "Space",
    detail: "Idle · 4 threads, 812 files",
  },
  {
    label: "scratch",
    kind: "space",
    kindLabel: "Space",
    detail: "Idle · resumes on next prompt",
  },
];

const agentListings: Listing[] = [
  {
    label: "Refactor the auth middleware",
    kind: "agent",
    kindLabel: "Agent",
    detail: "checkout-rewrite · 9 files edited",
  },
  {
    label: "Wire up the invite flow",
    kind: "agent",
    kindLabel: "Agent",
    detail: "api-migration · tests passing",
  },
  {
    label: "Fix the failing build",
    kind: "agent",
    kindLabel: "Agent",
    detail: "docs-site · ran pnpm build",
  },
  {
    label: "Draft the CLI reference",
    kind: "agent",
    kindLabel: "Agent",
    detail: "scratch · waiting on you",
  },
];

const steps = [
  {
    title: "Open a space",
    body: "A cloud machine with a filesystem, a shell, and ports you can expose. Nothing to install on your laptop.",
  },
  {
    title: "Prompt",
    body: "Describe the change and the agent works in the space — reading the repo, editing files, running commands.",
  },
  {
    title: "Take over",
    body: "Jump in from the Atlas CLI whenever you want the keyboard. Same machine, same files, no handoff.",
  },
  {
    title: "Ship",
    body: "Serve it on a port and share the public URL, or push from the space. The work ends where it was built.",
  },
];

const kindIcons = {
  space: Cpu,
  agent: Bot,
};

export function HowItWorks() {
  const [mode, setMode] = useState<Mode>("spaces");
  const listings = mode === "spaces" ? spaceListings : agentListings;

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-h"
      className="mm-section border-border scroll-mt-14 border-t"
    >
      <div className="mm-shell">
        <div className="max-w-2xl">
          <h2 id="how-h" className="mm-title text-foreground">
            From prompt to running code.
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
                workspace
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="View"
              className="bg-muted flex items-center gap-0.5 rounded-md p-0.5"
            >
              {(
                [
                  ["spaces", "Spaces"],
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

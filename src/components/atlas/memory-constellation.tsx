"use client";

import { Lock, Users, Clock } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Mode = "personal" | "organization";

interface MemoryNode {
  label: string;
  scope: "private" | "shared" | "organization";
  scopeLabel: string;
  detail: string;
}

const personalNodes: MemoryNode[] = [
  {
    label: "Coffee ritual",
    scope: "private",
    scopeLabel: "Private",
    detail: "Prefers pour-over, no sugar",
  },
  {
    label: "Writing style",
    scope: "private",
    scopeLabel: "Private",
    detail: "Concise, slightly dry humor",
  },
  {
    label: "Atlas project",
    scope: "shared",
    scopeLabel: "Shared",
    detail: "Visible to design partners",
  },
  {
    label: "Book notes",
    scope: "shared",
    scopeLabel: "Shared",
    detail: "Shared with reading group",
  },
];

const organizationNodes: MemoryNode[] = [
  {
    label: "Team architecture",
    scope: "organization",
    scopeLabel: "Organization",
    detail: "All engineering",
  },
  {
    label: "Brand guidelines",
    scope: "organization",
    scopeLabel: "Organization",
    detail: "Company-wide",
  },
  {
    label: "Q3 roadmap",
    scope: "shared",
    scopeLabel: "Shared",
    detail: "Leadership + product",
  },
  {
    label: "API contracts",
    scope: "private",
    scopeLabel: "Private",
    detail: "Owner only",
  },
];

const scopeIcons = {
  private: Lock,
  shared: Clock,
  organization: Users,
};

export function MemoryConstellation({
  mode,
  onModeChange,
}: {
  mode: Mode;
  onModeChange?: (mode: Mode) => void;
}) {
  const nodes = mode === "personal" ? personalNodes : organizationNodes;

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-mono text-xs tracking-tight">
            memory.scope
          </span>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <span className="text-muted-foreground hidden text-xs sm:inline">
            Permissions you can see and change
          </span>
        </div>

        {onModeChange ? (
          <Tabs value={mode} onValueChange={(v) => onModeChange(v as Mode)}>
            <TabsList
              variant="default"
              className="bg-muted h-8 rounded-lg p-0.5"
            >
              <TabsTrigger
                value="personal"
                className="h-7 rounded-md px-3 text-xs"
              >
                Personal
              </TabsTrigger>
              <TabsTrigger
                value="organization"
                className="h-7 rounded-md px-3 text-xs"
              >
                Organization
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        {nodes.map((node, i) => {
          const ScopeIcon = scopeIcons[node.scope];
          return (
            <div
              key={`${mode}-${node.label}`}
              className={cn(
                "flex flex-col gap-3 p-5 transition-colors duration-300",
                "hover:bg-muted/40",
                i % 2 === 0 && "sm:border-border sm:border-r",
                i < 2 && "border-border border-b",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground text-sm font-medium tracking-tight">
                  {node.label}
                </span>
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                  <ScopeIcon className="size-3" />
                  {node.scopeLabel}
                </span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {node.detail}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

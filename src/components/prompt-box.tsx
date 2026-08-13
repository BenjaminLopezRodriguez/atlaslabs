"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Check, ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MODELS = ["Auto · High", "Auto · Fast", "Manual"] as const;

const PLACEHOLDERS = [
  "Fine-tune a kids learning model that explains fractions without giving answers away.",
  "What do you want to learn today? — Atlas Life for a ten-year-old.",
  "Draft a specialist brief for subsurface utility mapping in concrete walls.",
  "Flag crop stress from last week’s imaging pass and suggest next actions.",
  "Cluster buying habits from consented floor signals for robotics training.",
  "Spin up a Remote machine and run this heavy fine-tune off my laptop.",
  "Scan this wall section and flag voids before we open it up.",
] as const;

export function PromptBox({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState<(typeof MODELS)[number]>("Auto · High");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const canSend = value.trim().length > 0;

  return (
    <div
      className={cn(
        "surface-card w-full overflow-hidden rounded-2xl",
        className,
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDERS[placeholderIndex]}
        className="min-h-[8rem] resize-none border-0 bg-transparent px-5 pt-5 pb-2 text-[0.98rem] leading-relaxed shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSend) {
            e.preventDefault();
          }
        }}
      />

      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-secondary/30 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Add attachment"
          >
            <Plus className="size-4" />
          </Button>

          {!signedIn ? (
            <Button
              nativeButton={false}
              render={<a href="/sign-in" />}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border-border/80 bg-card px-2.5 text-xs font-medium hover:bg-secondary"
            >
              <span
                aria-hidden
                className="inline-flex size-3.5 items-center justify-center rounded-full border border-foreground/25"
              >
                <span className="size-1.5 rounded-full bg-clay" />
              </span>
              Sign in
            </Button>
          ) : (
            <span className="px-1 text-xs text-muted-foreground">Ready</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-secondary hover:text-foreground">
              {model}
              <ChevronDown className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {MODELS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setModel(option)}
                  className="justify-between"
                >
                  {option}
                  {model === option ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            size="icon"
            disabled={!canSend}
            aria-label="Send prompt"
            className={cn(
              "size-8 rounded-lg transition-colors",
              canSend
                ? "bg-clay text-primary-foreground hover:bg-clay/90"
                : "bg-secondary text-muted-foreground",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}

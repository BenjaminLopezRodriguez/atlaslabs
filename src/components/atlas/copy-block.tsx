"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A command the reader is meant to run, with one-tap copy.
 *
 * `label` names the shell so a reader knows where it goes; `lines` keeps
 * multi-step snippets copyable as a block.
 */
export function CopyBlock({
  lines,
  label,
  className,
}: {
  lines: string[];
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard is blocked in some embedded browsers — the text is still
      // selectable, so fail quietly rather than throwing an error at the reader
    }
  }

  return (
    <div
      className={cn(
        "border-border bg-muted/40 group relative overflow-hidden rounded-xl border",
        className,
      )}
    >
      {label ? (
        <div className="border-border/70 text-muted-foreground border-b px-4 py-1.5 font-mono text-[11px] tracking-wide">
          {label}
        </div>
      ) : null}

      <div className="flex items-start gap-3 px-4 py-3">
        <pre className="text-foreground min-w-0 flex-1 overflow-x-auto font-mono text-[13px] leading-6">
          {lines.map((line) => (
            <div key={line} className="whitespace-pre">
              <span className="text-muted-foreground select-none">$ </span>
              {line}
            </div>
          ))}
        </pre>

        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="text-muted-foreground hover:text-foreground hover:bg-background/80 shrink-0 rounded-lg p-1.5 transition-colors"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLES = [
  "Learn our architecture and review every pull request.",
  "Turn our research process into an account intelligence specialist.",
  "Build a support specialist from our policies and resolved tickets.",
  "Monitor these suppliers and explain changes that matter.",
];

/**
 * The homepage prompt box. Submitting routes to /new?prompt=… — a protected
 * path — so the prompt survives the AuthKit sign-in round-trip via the
 * return path (spec §6 first-run flow, step 2).
 */
export function PromptBox() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const placeholder = EXAMPLES[0];

  function submit() {
    const p = prompt.trim();
    if (!p) return;
    router.push(`/new?prompt=${encodeURIComponent(p)}`);
  }

  return (
    <div className="w-full">
      <label htmlFor="atlas-prompt" className="sr-only">
        What should your Atlas become an expert in?
      </label>
      <div className="border-border bg-card focus-within:ring-ring/40 rounded-lg border p-2 shadow-xs focus-within:ring-2">
        <Textarea
          id="atlas-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={3}
          className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <p className="text-muted-foreground hidden text-[12px] sm:block">
            Enter to start · Shift+Enter for a new line
          </p>
          <Button
            onClick={submit}
            disabled={!prompt.trim()}
            className="h-8 rounded-md px-3.5 text-[13px] font-medium"
          >
            Start building
          </Button>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.slice(1).map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => setPrompt(ex)}
              className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/25 rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

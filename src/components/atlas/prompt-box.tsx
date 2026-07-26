"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "Learn our architecture and review every pull request.",
  "Turn our research process into an account intelligence specialist.",
  "Build a support specialist from our policies and resolved tickets.",
  "Monitor these suppliers and explain changes that matter.",
];

/**
 * The prompt composer, shared by the marketing hero and the signed-in app.
 * Submitting routes to /new?prompt=… — a protected path — so the prompt
 * survives the AuthKit sign-in round-trip via the return path (spec §6
 * first-run flow, step 2).
 */
export function PromptBox() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-border bg-card focus-within:border-ring focus-within:ring-ring/30 flex w-full flex-col rounded-3xl border shadow-sm focus-within:ring-3"
      >
        <textarea
          id="atlas-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={EXAMPLES[0]}
          rows={2}
          className="placeholder:text-muted-foreground min-h-16 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base outline-none md:text-sm"
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <p className="text-muted-foreground hidden text-[12px] sm:block">
            Enter to start · Shift+Enter for a new line
          </p>
          <Button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Start building"
            className="size-8 shrink-0 rounded-full p-0"
          >
            <Send className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </form>

      <ul className="divide-border mt-2 flex w-full flex-col divide-y">
        {EXAMPLES.slice(1).map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => setPrompt(ex)}
              className="text-muted-foreground hover:text-foreground w-full py-2.5 text-left text-sm transition-colors"
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

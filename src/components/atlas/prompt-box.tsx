"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatComposer } from "@/components/atlas/chat-composer";

const EXAMPLES = [
  "Learn our architecture and review every pull request.",
  "Turn our research process into an account intelligence specialist.",
  "Build a support specialist from our policies and resolved tickets.",
  "Monitor these suppliers and explain changes that matter.",
];

/**
 * Landing / specialist composer. Enter starts a chat; Zap drafts a specialist
 * from the prompt (spec §6 first-run via /app/new).
 */
export function PromptBox({
  chatHref = "/app",
  specialistHref = "/app/new",
}: {
  /** Where Enter / send goes with the prompt (chat). */
  chatHref?: string;
  /** Where Zap goes with the prompt (specialist). */
  specialistHref?: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function go(base: string) {
    const p = prompt.trim();
    if (!p) return;
    const sep = base.includes("?") ? "&" : "?";
    router.push(`${base}${sep}prompt=${encodeURIComponent(p)}`);
  }

  return (
    <div className="w-full">
      <label htmlFor="atlas-prompt" className="sr-only">
        Atlas
      </label>

      <ChatComposer
        id="atlas-prompt"
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => go(chatHref)}
        onSpecialist={() => go(specialistHref)}
        placeholder={EXAMPLES[0]}
        submitLabel="Start"
      />

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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatComposer } from "@/components/atlas/chat-composer";
import type { SpaceOption } from "@/components/atlas/composer-tools";

const EXAMPLES = [
  "Learn our architecture and review every pull request.",
  "Turn our research process into an account intelligence specialist.",
  "Build a support specialist from our policies and resolved tickets.",
  "Monitor these suppliers and explain changes that matter.",
];

/** Shown once a space is picked — the prompt now edits files on that box. */
const SPACE_EXAMPLES = [
  "Add a health check route and restart the server.",
  "Read package.json and upgrade the outdated deps.",
  "Create an index.html that says hello and serve it on port 3000.",
];

/**
 * Landing composer. Enter starts a chat; the space control binds the prompt to
 * a machine, and a bound prompt opens a thread that edits files on it.
 */
export function PromptBox({
  chatHref = "/app",
  spaces,
  signedIn = false,
}: {
  /** Where Enter / send goes with the prompt (chat). */
  chatHref?: string;
  /** Spaces the viewer can work in. Empty when signed out. */
  spaces?: SpaceOption[];
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);

  const examples = spaceId ? SPACE_EXAMPLES : EXAMPLES.slice(1);

  function go() {
    const p = prompt.trim();
    if (!p) return;
    const params = new URLSearchParams({ prompt: p });
    if (spaceId) params.set("space", spaceId);
    router.push(`${chatHref}?${params.toString()}`);
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
        onSubmit={go}
        placeholder={spaceId ? SPACE_EXAMPLES[0] : EXAMPLES[0]}
        submitLabel="Start"
        spaces={spaces ?? []}
        spaceId={spaceId}
        onSpaceChange={setSpaceId}
        signedIn={signedIn}
      />

      <ul className="divide-border mt-2 flex w-full flex-col divide-y">
        {examples.map((ex) => (
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

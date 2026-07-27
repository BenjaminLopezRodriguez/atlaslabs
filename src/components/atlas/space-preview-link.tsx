"use client";

import { ExternalLink } from "lucide-react";

import { api } from "@/trpc/react";

/**
 * Preview link for a space-bound thread — the running app on the machine you
 * are prompting against, one click from the conversation that changed it.
 *
 * Renders nothing until there is a real URL to hand over. A dead "Preview" that
 * 404s is worse than no button, and the tunnel only exists once the space is
 * running and something is bound to the port.
 */
export function SpacePreviewLink({ machineId }: { machineId: string }) {
  const q = api.thread.spacePreview.useQuery(
    { machineId },
    // The port comes up shortly after the machine does; stop asking once it has.
    { refetchInterval: (query) => (query.state.data?.url ? false : 5000) },
  );

  const data = q.data;
  if (!data?.url) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${data.slug} on port ${data.port}`}
      className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors"
    >
      <ExternalLink className="size-3.5" aria-hidden="true" />
      Preview
    </a>
  );
}

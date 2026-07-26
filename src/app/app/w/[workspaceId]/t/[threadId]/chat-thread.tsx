"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/trpc/react";

/** Live status of the most recently started run (polls run events). */
function RunStatus({ runId }: { runId: string }) {
  const q = api.run.events.useQuery(
    { runId, after: 0 },
    {
      refetchInterval: (query) =>
        query.state.data?.status === "succeeded" ||
        query.state.data?.status === "failed" ||
        query.state.data?.status === "cancelled"
          ? false
          : 1500,
    },
  );
  const status = q.data?.status;
  if (!status || status === "succeeded") return null;
  const last = q.data?.events.at(-1);
  return (
    <p className="text-muted-foreground text-[12px]">
      run {status}
      {last ? ` · ${last.kind}` : ""}
      {status === "failed" ? " — see run log" : "…"}
    </p>
  );
}

/**
 * Explicit correction capture on a specialist output; promotion is a
 * separate explicit action (spec §5).
 */
function CorrectionControls({
  specialistId,
  messageId,
  runId,
}: {
  specialistId: string;
  messageId: string;
  runId: string;
}) {
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [promoted, setPromoted] = useState(false);

  const create = api.correction.create.useMutation({
    onSuccess: (row) => setCorrectionId(row?.id ?? null),
  });
  const promote = api.correction.promote.useMutation({
    onSuccess: () => setPromoted(true),
  });

  if (promoted) {
    return (
      <p className="text-muted-foreground mt-1 text-[12px]">
        Correction promoted to evaluation.
      </p>
    );
  }
  if (correctionId) {
    return (
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">Correction recorded.</span>
        <button
          className="text-foreground underline disabled:opacity-50"
          disabled={promote.isPending}
          onClick={() => promote.mutate({ correctionId, to: "evaluation" })}
        >
          Promote to evaluation
        </button>
        <button
          className="text-foreground underline disabled:opacity-50"
          disabled={promote.isPending}
          onClick={() => promote.mutate({ correctionId, to: "example" })}
        >
          Promote to example
        </button>
      </div>
    );
  }
  const base = { specialistId, messageId, runId };
  return (
    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[12px]">
      <button
        className="hover:text-foreground underline"
        disabled={create.isPending}
        onClick={() => create.mutate({ ...base, kind: "accepted" })}
      >
        Accept
      </button>
      <button
        className="hover:text-foreground underline"
        disabled={create.isPending}
        onClick={() => create.mutate({ ...base, kind: "rejected" })}
      >
        Reject
      </button>
      <button
        className="hover:text-foreground underline"
        disabled={create.isPending}
        onClick={() => {
          const replacement = window.prompt("Corrected output / instruction:");
          if (replacement) {
            create.mutate({
              ...base,
              kind: "edited",
              note: "Edited in chat",
              replacement,
            });
          }
        }}
      >
        Correct…
      </button>
    </div>
  );
}

export function ChatThread({
  workspaceId,
  threadId,
}: {
  workspaceId: string;
  threadId: string;
}) {
  const utils = api.useUtils();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const q = api.thread.messages.useQuery(
    { threadId },
    // Poll — replaced by run-event streaming in the runs slice.
    { refetchInterval: 4000 },
  );
  const post = api.thread.post.useMutation({
    onSuccess: () => utils.thread.messages.invalidate({ threadId }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [q.data?.messages.length]);

  function send() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    post.mutate({ threadId, content });
  }

  if (q.isLoading) {
    return <p className="text-muted-foreground px-6 py-10 text-sm">Loading…</p>;
  }
  if (q.isError) {
    return (
      <p role="alert" className="text-destructive px-6 py-10 text-sm">
        {q.error.message}
      </p>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/w/${workspaceId}`}
            className="text-muted-foreground hover:text-foreground text-[13px]"
          >
            ← Workspace
          </Link>
          <h1 className="text-sm font-medium tracking-tight">
            {q.data?.thread.title}
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
        {q.data?.messages.map((m) => (
          <div key={m.id} className="text-sm leading-relaxed">
            <p className="text-muted-foreground text-[12px] font-medium">
              {m.role === "user"
                ? (m.author?.name ?? m.author?.email ?? "You")
                : "Atlas"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
            {m.role === "assistant" &&
              q.data.thread.specialistId &&
              typeof (m.meta as { runId?: string })?.runId === "string" && (
                <CorrectionControls
                  specialistId={q.data.thread.specialistId}
                  messageId={m.id}
                  runId={(m.meta as { runId: string }).runId}
                />
              )}
          </div>
        ))}
        {post.data?.runId && <RunStatus runId={post.data.runId} />}
        <div ref={bottomRef} />
      </main>

      <footer className="border-border sticky bottom-0 border-t bg-inherit px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Message this specialist…"
            className="resize-none"
          />
          <Button
            onClick={send}
            disabled={post.isPending || !draft.trim()}
            className="h-9 shrink-0 rounded-md px-3.5 text-[13px]"
          >
            Send
          </Button>
        </div>
      </footer>
    </div>
  );
}

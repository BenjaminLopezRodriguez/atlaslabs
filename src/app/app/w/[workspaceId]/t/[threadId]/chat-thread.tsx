"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, FileDiff } from "lucide-react";

import { AgentPlan, type PlanStep } from "@/components/atlas/agent-plan";
import {
  ChatComposer,
  ChatThreadMenu,
  type ComposerSubmitOpts,
} from "@/components/atlas/chat-composer";
import { ChatThreadHeader } from "@/components/atlas/chat-thread-header";
import {
  EditReview,
  type ReviewableEdit,
} from "@/components/atlas/edit-review";
import { SpacePreviewLink } from "@/components/atlas/space-preview-link";
import { AgentMarkdown } from "@/components/atlas/agent-markdown";
import {
  BuildStage,
  type BuildStageMeta,
} from "@/components/atlas/build-stage";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

type Progress = { phase: string; detail?: string };

/** A reply row that exists but has not finished; meta carries its progress. */
function runningProgress(meta: unknown): Progress[] | null {
  const m = meta as { running?: boolean; progress?: Progress[] } | null;
  return m?.running ? (m.progress ?? []) : null;
}

/** Empty streaming reply — caret, then throb + Thinking… after 200ms. */
function AgentPendingReply({ label = "thinking..." }: { label?: string }) {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setWaiting(true), 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "bg-foreground inline-block h-4 w-0.5 rounded-[1px]",
            waiting ? "cursor-throb" : "animate-pulse",
          )}
        />
        {waiting ? (
          <span className="shimmer text-sm font-medium">{label}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What the turn has done so far. The last entry is still in flight, so it
 * throbs; everything above it is settled and reads as history.
 */
function AgentProgress({
  steps,
  startedAt,
}: {
  steps: Progress[];
  startedAt: Date | string;
}) {
  const done = steps.slice(0, -1);
  const current = steps.at(-1);
  /*
   * Nothing reported yet and the row is not new: the turn is queued behind
   * another, or no worker is running at all. Silence is the failure mode of a
   * background queue, so name it instead of throbbing indefinitely.
   */
  const stalled =
    steps.length === 0 && Date.now() - new Date(startedAt).getTime() > 30_000;
  return (
    <div className="mb-2 flex flex-col gap-1" aria-live="polite">
      {done.map((s, i) => (
        <span key={`${s.phase}-${i}`} className="text-muted-foreground text-xs">
          {s.detail ?? s.phase}
        </span>
      ))}
      <AgentPendingReply
        label={
          current?.detail ??
          current?.phase ??
          (stalled ? "still waiting to start…" : "thinking...")
        }
      />
    </div>
  );
}

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
  const label =
    status === "failed"
      ? "failed"
      : last?.kind
        ? `${status} · ${last.kind}`
        : "thinking...";
  return <AgentPendingReply label={label} />;
}

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
  const router = useRouter();
  const utils = api.useUtils();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const q = api.thread.messages.useQuery(
    { threadId },
    {
      // A turn in flight writes progress to its reply row; poll for it.
      refetchInterval: (query) =>
        query.state.data?.messages.some((m) => runningProgress(m.meta))
          ? 1200
          : 4000,
    },
  );
  const post = api.thread.post.useMutation({
    onSuccess: () => {
      setOptimistic(null);
      void utils.thread.messages.invalidate({ threadId });
      void utils.thread.list.invalidate({ workspaceId });
    },
    onError: () => setOptimistic(null),
  });
  const createSpecialist = api.specialist.createFromPrompt.useMutation({
    onSuccess: ({ specialist, threadId: nextThreadId }) => {
      void utils.thread.list.invalidate({
        workspaceId: specialist.workspaceId,
      });
      router.push(`/app/w/${specialist.workspaceId}/t/${nextThreadId}`);
    },
  });
  const spaces = api.thread.spaces.useQuery({ workspaceId });
  /*
   * Edits are fetched rather than read from the message meta: accepting one
   * changes its status, and the message row is immutable history.
   */
  const edits = api.space.edits.useQuery(
    { threadId },
    { enabled: Boolean(q.data?.thread.machineId) },
  );
  const editsById = new Map(
    (edits.data ?? []).map((e) => [e.id, e as ReviewableEdit]),
  );
  const pendingEdits: ReviewableEdit[] = (edits.data ?? []).filter(
    (e) => e.status === "pending",
  );

  const messages = q.data?.messages ?? [];
  const studio = messages.length > 0 || Boolean(optimistic);
  const busy = post.isPending || createSpecialist.isPending;
  const awaiting =
    post.isPending ||
    createSpecialist.isPending ||
    Boolean(post.data?.runId && post.isSuccess);

  useEffect(() => {
    if (!studio) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [studio, messages.length, optimistic, awaiting]);

  function send(opts: ComposerSubmitOpts) {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    setOptimistic(content);
    post.mutate({ threadId, content, paths: opts.paths });
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

  const title = q.data?.thread.title ?? "Chat";
  const kind = q.data?.thread.specialistId ? "specialist" : "chat";
  const boundMachineId = q.data?.thread.machineId ?? null;

  return (
    <section className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {studio ? (
        <ChatThreadHeader
          title={title}
          leading={
            /* Own pill, mobile only — manycat's back affordance: the title is
               already the breadcrumb on desktop. */
            <div className="bg-background/90 flex items-center rounded-full p-1 shadow-md ring-1 ring-black/5 backdrop-blur-md md:hidden dark:ring-white/10">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back to workspace"
                className="size-8 rounded-full"
                nativeButton={false}
                render={<Link href={`/app/w/${workspaceId}`} />}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            </div>
          }
          actions={
            <>
              {pendingEdits.length ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Review ${pendingEdits.length} pending change${
                    pendingEdits.length === 1 ? "" : "s"
                  }`}
                  className="relative size-8 rounded-full"
                  onClick={() => setChangesOpen(true)}
                >
                  <FileDiff className="size-4" aria-hidden="true" />
                  <span
                    className="bg-signal absolute top-0.5 right-0.5 size-2 rounded-full"
                    aria-hidden
                  />
                </Button>
              ) : null}
              {boundMachineId ? (
                <SpacePreviewLink machineId={boundMachineId} />
              ) : null}
              <ChatThreadMenu>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem
                    onClick={() => router.push(`/app/w/${workspaceId}`)}
                  >
                    Workspace
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/app")}>
                    New chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </ChatThreadMenu>
            </>
          }
        />
      ) : null}

      {/* Pending diffs, gathered. Inline cards stay the primary review surface;
          this is for the ones that scrolled away — the mobile case. */}
      <Drawer
        open={changesOpen}
        onOpenChange={setChangesOpen}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent className="flex max-h-none flex-col p-0 sm:max-w-md">
          <DrawerHeader className="border-b px-6 pt-6 pb-4 text-left">
            <DrawerTitle className="text-left leading-snug">
              Pending changes
            </DrawerTitle>
            <DrawerDescription className="text-left font-mono text-xs">
              {pendingEdits.length}{" "}
              {pendingEdits.length === 1 ? "file" : "files"} waiting on you
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <EditReview threadId={threadId} edits={pendingEdits} />
          </div>
        </DrawerContent>
      </Drawer>

      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-8 transition-[justify-content,gap,padding] duration-500 ease-out md:px-10",
          studio
            ? "justify-end gap-4 overflow-hidden pt-14 pb-6 md:pt-16"
            : "items-center justify-center gap-6 py-8",
        )}
      >
        {studio ? (
          <div className="min-h-0 w-full flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 py-2">
              <Marker role="status" className="my-2">
                <MarkerContent>
                  {kind === "specialist" ? "Specialist" : "Chat"} · atlas
                </MarkerContent>
              </Marker>

              {messages.map((m) =>
                m.role === "user" ? (
                  <Message key={m.id} align="end">
                    <MessageContent>
                      <Bubble variant="default">
                        <BubbleContent className="max-w-[min(100%,24rem)]">
                          {m.content}
                        </BubbleContent>
                      </Bubble>
                      <MessageFooter className="gap-1">
                        {formatTime(m.createdAt)}
                        <CheckCheck className="size-3.5" aria-hidden="true" />
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                ) : (
                  <Message key={m.id} align="start">
                    <MessageContent className="max-w-none">
                      <BuildStage meta={(m.meta ?? {}) as BuildStageMeta} />
                      {runningProgress(m.meta) ? (
                        <AgentProgress
                          steps={runningProgress(m.meta)!}
                          startedAt={m.createdAt}
                        />
                      ) : null}
                      <AgentMarkdown text={m.content} />
                      <AgentPlan
                        steps={(m.meta as { plan?: PlanStep[] })?.plan ?? []}
                      />
                      <EditReview
                        threadId={threadId}
                        edits={(
                          (m.meta as { editIds?: string[] })?.editIds ?? []
                        )
                          .map((id) => editsById.get(id))
                          .filter((e): e is ReviewableEdit => Boolean(e))}
                      />
                      {q.data?.thread.specialistId &&
                        typeof (m.meta as { runId?: string })?.runId ===
                          "string" && (
                          <CorrectionControls
                            specialistId={q.data.thread.specialistId}
                            messageId={m.id}
                            runId={(m.meta as { runId: string }).runId}
                          />
                        )}
                      <MessageFooter>{formatTime(m.createdAt)}</MessageFooter>
                    </MessageContent>
                  </Message>
                ),
              )}

              {optimistic &&
              !messages.some(
                (m) => m.role === "user" && m.content === optimistic,
              ) ? (
                <Message align="end">
                  <MessageContent>
                    <Bubble variant="default">
                      <BubbleContent className="max-w-[min(100%,24rem)]">
                        {optimistic}
                      </BubbleContent>
                    </Bubble>
                    <MessageFooter className="gap-1">
                      {formatTime(new Date())}
                      <CheckCheck className="size-3.5" aria-hidden="true" />
                    </MessageFooter>
                  </MessageContent>
                </Message>
              ) : null}

              {(post.isPending || createSpecialist.isPending) &&
              !messages.some((m) => runningProgress(m.meta)) ? (
                <Message align="start">
                  <MessageContent className="max-w-none">
                    <AgentPendingReply
                      label={
                        createSpecialist.isPending
                          ? "Inferring specialist…"
                          : "thinking..."
                      }
                    />
                  </MessageContent>
                </Message>
              ) : null}
              {post.data?.runId && !post.isPending ? (
                <Message align="start">
                  <MessageContent className="max-w-none">
                    <RunStatus runId={post.data.runId} />
                  </MessageContent>
                </Message>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </div>
        ) : (
          <header className="flex max-w-xl flex-col items-center gap-2 text-center">
            <h1 className="font-heading text-2xl font-normal tracking-tight md:text-3xl">
              Ready when you are.
            </h1>
          </header>
        )}

        <div
          className={cn(
            "flex w-full flex-col gap-2",
            studio && "relative z-10 shrink-0",
          )}
        >
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            placeholder={
              boundMachineId
                ? "Change a file in this space…"
                : studio
                  ? "Message…"
                  : "What should we work on?"
            }
            disabled={busy}
            studio={studio}
            spaces={spaces.data ?? []}
            spaceId={boundMachineId}
            /* Fixed once the thread exists — the transcript records changes to
               one machine, so re-pointing it would falsify earlier messages. */
            onSpaceChange={undefined}
            signedIn
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Signed-in home composer. First send morphs into a thread (center → bottom),
 * then navigates to the persisted thread URL.
 */
export function ChatHome({
  initialPrompt,
  initialSpaceId,
}: {
  initialPrompt?: string;
  initialSpaceId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [boot, setBoot] = useState<{ text: string } | null>(
    initialPrompt?.trim() ? { text: initialPrompt.trim() } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(initialSpaceId ?? null);
  const started = useRef(false);

  const workspaces = api.workspace.list.useQuery();
  const spaces = api.thread.spaces.useQuery();
  const createThread = api.thread.create.useMutation();
  const post = api.thread.post.useMutation();
  const createSpecialist = api.specialist.createFromPrompt.useMutation();

  const studio = Boolean(boot);
  const busy =
    createThread.isPending || post.isPending || createSpecialist.isPending;

  async function startChat(text: string, paths: string[] = []) {
    // A space-bound thread must live in that space's workspace, not blindly in
    // the personal one, or `post` would reject the pairing.
    const space = spaces.data?.find((s) => s.id === spaceId) ?? null;
    const workspaceId = space?.workspaceId ?? workspaces.data?.personal.id;
    if (!workspaceId) return;
    setError(null);
    setBoot({ text });
    setDraft("");
    try {
      const thread = await createThread.mutateAsync({
        workspaceId,
        machineId: space?.id,
      });
      await post.mutateAsync({ threadId: thread.id, content: text, paths });
      void utils.thread.list.invalidate({ workspaceId });
      router.replace(`/app/w/${workspaceId}/t/${thread.id}`);
    } catch (e) {
      setBoot(null);
      setError(e instanceof Error ? e.message : "Could not start chat");
    }
  }

  useEffect(() => {
    const text = initialPrompt?.trim();
    if (!text || !workspaces.data?.personal.id || started.current) return;
    // A ?space= from the landing needs its workspace resolved before we start.
    if (initialSpaceId && !spaces.data) return;
    started.current = true;
    void startChat(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot
  }, [initialPrompt, workspaces.data?.personal.id, spaces.data]);

  async function send(opts: ComposerSubmitOpts) {
    const text = draft.trim();
    if (!text || busy) return;
    await startChat(text, opts.paths);
  }

  return (
    <section className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {studio ? (
        <ChatThreadHeader
          title={boot!.text.slice(0, 48)}
          actions={
            <ChatThreadMenu>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => router.push("/app")}>
                  New chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </ChatThreadMenu>
          }
        />
      ) : null}

      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-8 transition-[justify-content,gap,padding] duration-500 ease-out md:px-10",
          studio
            ? "justify-end gap-4 overflow-hidden pt-14 pb-6 md:pt-16"
            : "items-center justify-center gap-6 py-8",
        )}
      >
        {studio ? (
          <div className="min-h-0 w-full flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 py-2">
              <Marker role="status" className="my-2">
                <MarkerContent>Chat · atlas</MarkerContent>
              </Marker>
              <Message align="end">
                <MessageContent>
                  <Bubble variant="default">
                    <BubbleContent className="max-w-[min(100%,24rem)]">
                      {boot!.text}
                    </BubbleContent>
                  </Bubble>
                  <MessageFooter className="gap-1">
                    {formatTime(new Date())}
                    <CheckCheck className="size-3.5" aria-hidden="true" />
                  </MessageFooter>
                </MessageContent>
              </Message>
              <Message align="start">
                <MessageContent className="max-w-none">
                  <AgentPendingReply
                    label={
                      createSpecialist.isPending
                        ? "Inferring specialist…"
                        : "thinking..."
                    }
                  />
                </MessageContent>
              </Message>
            </div>
          </div>
        ) : (
          <header className="flex max-w-xl flex-col items-center gap-2 text-center">
            <h1 className="font-heading text-2xl font-normal tracking-tight md:text-3xl">
              Ready when you are.
            </h1>
          </header>
        )}

        <div
          className={cn(
            "flex w-full flex-col gap-2",
            studio && "relative z-10 shrink-0",
          )}
        >
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={(opts) => void send(opts)}
            placeholder={
              spaceId
                ? "Change a file in this space…"
                : studio
                  ? "Message…"
                  : "What should we work on?"
            }
            disabled={busy || !workspaces.data}
            studio={studio}
            spaces={spaces.data ?? []}
            spaceId={spaceId}
            onSpaceChange={setSpaceId}
            signedIn
          />
        </div>
      </div>
    </section>
  );
}

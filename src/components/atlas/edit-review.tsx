"use client";

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useState } from "react";

import { diffLines } from "@/lib/diff";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

export type ReviewableEdit = {
  id: string;
  path: string;
  before: string | null;
  after: string;
  status: "pending" | "applied" | "rejected";
};

/**
 * Proposed file writes, with the diff and an accept/reject per file.
 *
 * Nothing here has touched the VM yet — accepting is what writes the file.
 */
export function EditReview({
  edits,
  threadId,
}: {
  edits: ReviewableEdit[];
  threadId: string;
}) {
  if (!edits.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {edits.map((edit) => (
        <EditCard key={edit.id} edit={edit} threadId={threadId} />
      ))}
    </div>
  );
}

function EditCard({
  edit,
  threadId,
}: {
  edit: ReviewableEdit;
  threadId: string;
}) {
  const [open, setOpen] = useState(edit.status === "pending");
  const utils = api.useUtils();
  const resolve = api.space.resolveEdit.useMutation({
    onSuccess: () => {
      void utils.space.edits.invalidate({ threadId });
    },
  });

  const lines = diffLines(edit.before ?? "", edit.after);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;
  const pending = edit.status === "pending" && !resolve.isSuccess;

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="bg-muted/40 flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
          <span className="truncate font-mono text-[12px]">{edit.path}</span>
          {edit.before === null ? (
            <span className="text-muted-foreground shrink-0 text-[11px]">
              new
            </span>
          ) : null}
          <span className="shrink-0 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
            +{added}
          </span>
          <span className="text-destructive shrink-0 font-mono text-[11px]">
            −{removed}
          </span>
        </button>

        {pending ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({ editId: edit.id, accept: false })
              }
              className="text-muted-foreground hover:text-foreground rounded-md p-1"
              aria-label={`Reject changes to ${edit.path}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ editId: edit.id, accept: true })}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              {resolve.isPending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3" aria-hidden="true" />
              )}
              Accept
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground shrink-0 text-[11px] capitalize">
            {resolve.data?.status ?? edit.status}
          </span>
        )}
      </div>

      {resolve.error ? (
        <p className="text-destructive px-3 py-2 text-xs">
          {resolve.error.message}
        </p>
      ) : null}

      {open ? (
        <pre className="max-h-80 overflow-auto bg-transparent px-0 py-2 text-[12px] leading-[1.5]">
          {lines.map((line, i) => (
            <code
              key={i}
              className={cn(
                "block px-3 font-mono whitespace-pre",
                line.kind === "add" &&
                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                line.kind === "del" && "bg-red-500/10 text-red-700 dark:text-red-300",
                line.kind === "ctx" && "text-muted-foreground",
              )}
            >
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
              {line.text}
            </code>
          ))}
        </pre>
      ) : null}
    </div>
  );
}

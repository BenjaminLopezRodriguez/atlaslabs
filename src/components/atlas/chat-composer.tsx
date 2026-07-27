"use client";

import { ChevronDown, MoreVertical, Search, Send } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

import {
  AttachMenu,
  EffortSlider,
  ModelPicker,
  SpacePicker,
  type Attachment,
  type SpaceOption,
} from "@/components/atlas/composer-tools";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EffortId, ModelId } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

export type ComposerSubmitOpts = {
  model: ModelId;
  effort: EffortId;
  attachments: Attachment[];
  research: boolean;
  /** Files @-mentioned in the draft, to pin into the agent's context. */
  paths: string[];
};

/** The `@…` the caret currently sits in, or null. */
function mentionAt(value: string, caret: number) {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const token = upto.slice(at + 1);
  // A mention is one unbroken run: whitespace ends it, and so does a second @.
  if (/[\s@]/.test(token)) return null;
  return { start: at, query: token };
}

/** Every @path in the draft — what gets pinned on send. */
export function mentionedPaths(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)@([^\s@]+)/g)]
    .map((m) => m[1]!)
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Shared chat composer — manycat chrome: attach/model on home, research +
 * effort + send in-thread, and the space control that binds a prompt to a
 * machine.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  submitLabel = "Send",
  spaces,
  spaceId,
  onSpaceChange,
  signedIn = false,
  /** Home landing: attach + model picker. Thread: research + effort left. */
  studio = false,
  footer,
  className,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (opts: ComposerSubmitOpts) => void;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  /** Omit to hide the space control entirely. */
  spaces?: SpaceOption[];
  spaceId?: string | null;
  onSpaceChange?: (next: string | null) => void;
  signedIn?: boolean;
  studio?: boolean;
  footer?: ReactNode;
  className?: string;
  id?: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [model, setModel] = useState<ModelId>("auto");
  const [effort, setEffort] = useState<EffortId>("high");
  const [research, setResearch] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Only a space-bound composer can mention files — there is nothing to list otherwise.
  const files = api.space.files.useQuery(
    { machineId: spaceId ?? "", query: mention?.query, limit: 8 },
    { enabled: Boolean(spaceId) && mention !== null },
  );
  const suggestions = files.data?.files ?? [];

  const canSend = Boolean(value.trim()) && !disabled;
  const opts: ComposerSubmitOpts = {
    model,
    effort,
    attachments,
    research,
    paths: mentionedPaths(value),
  };

  const syncMention = useCallback(
    (el: HTMLTextAreaElement) => {
      setMention(spaceId ? mentionAt(el.value, el.selectionStart) : null);
    },
    [spaceId],
  );

  function pick(path: string) {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next =
      value.slice(0, mention.start) + `@${path} ` + value.slice(caret);
    onChange(next);
    setMention(null);
    requestAnimationFrame(() => el?.focus());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setMention(null);
    onSubmit(opts);
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "bg-card flex w-full flex-col rounded-3xl border shadow-sm",
        "focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-3",
        className,
      )}
    >
      {mention && suggestions.length ? (
        <ul
          role="listbox"
          aria-label="Files in this space"
          className="border-border bg-popover mx-2 mt-2 max-h-56 overflow-y-auto rounded-xl border p-1 shadow-sm"
        >
          {suggestions.map((path) => (
            <li key={path}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown, not click: the textarea's blur would close the
                  // menu before a click ever landed.
                  e.preventDefault();
                  pick(path);
                }}
                className="hover:bg-muted w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-[12px]"
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          syncMention(e.currentTarget);
        }}
        onClick={(e) => syncMention(e.currentTarget)}
        onBlur={() => setMention(null)}
        onKeyDown={(e) => {
          if (mention && suggestions.length) {
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              pick(suggestions[0]!);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className="placeholder:text-muted-foreground min-h-16 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base outline-none md:text-sm"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {!studio ? (
            <AttachMenu
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              disabled={disabled}
            />
          ) : null}
          {studio ? (
            <button
              type="button"
              onClick={() => setResearch((v) => !v)}
              aria-pressed={research}
              title="Research — dig deeper before replying"
              disabled={disabled}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                research
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <Search className="size-3.5" aria-hidden="true" />
              Research
            </button>
          ) : null}
          {studio ? (
            <DropdownMenu open={effortOpen} onOpenChange={setEffortOpen}>
              <DropdownMenuTrigger
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 rounded-full px-2.5 text-xs capitalize transition-colors outline-none disabled:opacity-50"
                aria-label="Select effort"
              >
                {effort}
                <ChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56 p-1.5">
                <EffortSlider
                  value={effort}
                  onChange={(next) => {
                    setEffort(next);
                    setEffortOpen(false);
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {/* Where the specialist bolt used to be: pick the space to work in. */}
          {spaces ? (
            <SpacePicker
              spaces={spaces}
              value={spaceId ?? null}
              onChange={onSpaceChange ?? (() => undefined)}
              signedIn={signedIn}
              disabled={disabled}
              compact={!studio}
            />
          ) : null}
          {footer}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!studio ? (
            <ModelPicker
              model={model}
              effort={effort}
              onModelChange={setModel}
              onEffortChange={setEffort}
              disabled={disabled}
            />
          ) : null}
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            aria-label={submitLabel}
            className="size-8 shrink-0 rounded-full bg-slate-300 p-0 text-black hover:bg-slate-300/80"
          >
            <Send className="size-3.5 text-black" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Thread overflow menu trigger — manycat action pill style. */
export function ChatThreadMenu({ children }: { children?: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-full transition-colors outline-none"
        aria-label="Thread actions"
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}

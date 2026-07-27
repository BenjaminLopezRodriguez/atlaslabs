"use client";

import { ChevronDown, MoreVertical, Search, Send } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

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

export type ComposerSubmitOpts = {
  model: ModelId;
  effort: EffortId;
  attachments: Attachment[];
  research: boolean;
};

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

  const canSend = Boolean(value.trim()) && !disabled;
  const opts: ComposerSubmitOpts = { model, effort, attachments, research };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
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
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
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

"use client";

import {
  ChevronDown,
  GitBranch,
  Image as ImageIcon,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AI_MODELS,
  EFFORT_LEVELS,
  type EffortId,
  type ModelId,
} from "@/lib/ai-models";
import { cn } from "@/lib/utils";

const ATTACH_OPTIONS = [
  { id: "source", label: "Connect source", icon: GitBranch },
  { id: "media", label: "Add media", icon: ImageIcon },
  { id: "research", label: "Research in depth", icon: Search },
] as const;

type AttachOptionId = (typeof ATTACH_OPTIONS)[number]["id"];

export type Attachment =
  | { key: string; kind: "source"; label: string }
  | { key: string; kind: "media"; label: string }
  | { key: string; kind: "research"; label: string };

export function AttachMenu({
  attachments,
  onAttachmentsChange,
  disabled,
}: {
  attachments: Attachment[];
  onAttachmentsChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasAttachments = attachments.length > 0;

  function handleSelect(id: AttachOptionId) {
    setOpen(false);
    if (id === "source") {
      const name = window.prompt("Source name (e.g. owner/repo or docs path):");
      if (!name?.trim()) return;
      onAttachmentsChange([
        ...attachments.filter((a) => a.kind !== "source"),
        {
          key: "source",
          kind: "source",
          label: name.trim(),
        },
      ]);
      return;
    }
    onAttachmentsChange(
      attachments.some((a) => a.kind === id)
        ? attachments.filter((a) => a.kind !== id)
        : [
            ...attachments,
            {
              key: id,
              kind: id,
              label: id === "media" ? "Media" : "Research",
            },
          ],
    );
  }

  const addButtonClass = cn(
    "size-8 shrink-0 rounded-full transition-colors",
    hasAttachments
      ? "bg-muted text-foreground hover:bg-muted/80"
      : "text-muted-foreground",
  );

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            addButtonClass,
          )}
          aria-label="Add"
        >
          <Plus className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {ATTACH_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.id}
              onClick={() => handleSelect(option.id)}
            >
              <option.icon className="size-4" />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {hasAttachments ? (
        <div className="flex max-w-[min(100%,14rem)] min-w-0 scrollbar-none items-center gap-1.5 overflow-x-auto sm:max-w-[18rem]">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.key}
              attachment={attachment}
              onRemove={() =>
                onAttachmentsChange(
                  attachments.filter((a) => a.key !== attachment.key),
                )
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const Icon =
    attachment.kind === "source"
      ? GitBranch
      : attachment.kind === "media"
        ? ImageIcon
        : Search;

  return (
    <span className="bg-muted text-foreground inline-flex h-7 shrink-0 items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium">
      <Icon className="text-muted-foreground size-3" />
      <span className="max-w-24 truncate">{attachment.label}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded-full"
        aria-label={`Remove ${attachment.label}`}
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

export function EffortSlider({
  value,
  onChange,
}: {
  value: EffortId;
  onChange: (next: EffortId) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">
          Effort
        </span>
        <span className="text-xs font-medium capitalize">{value}</span>
      </div>
      <div role="group" aria-label="Effort" className="grid grid-cols-4 gap-1">
        {EFFORT_LEVELS.map((level) => {
          const selected = level.id === value;
          return (
            <button
              key={level.id}
              type="button"
              className={cn(
                "rounded-full px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                selected
                  ? "bg-foreground text-background"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={selected}
              onClick={() => onChange(level.id)}
            >
              {level.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ModelPicker({
  model,
  effort,
  onModelChange,
  onEffortChange,
  disabled,
}: {
  model: ModelId;
  effort: EffortId;
  onModelChange: (next: ModelId) => void;
  onEffortChange: (next: EffortId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = AI_MODELS.find((m) => m.id === model)?.label ?? "Auto";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1 rounded-full px-2.5 text-sm transition-colors outline-none disabled:opacity-50"
        aria-label="Select AI model"
      >
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground capitalize">{effort}</span>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 p-1.5">
        <div
          onPointerDown={(e) => e.preventDefault()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <EffortSlider value={effort} onChange={onEffortChange} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={model}
          onValueChange={(value) => {
            onModelChange(value as ModelId);
            setOpen(false);
          }}
        >
          {AI_MODELS.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id}>
              <span className="flex flex-col gap-0.5">
                <span>{item.label}</span>
                <span className="text-muted-foreground text-[11px] font-normal">
                  {item.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

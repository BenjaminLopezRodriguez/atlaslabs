"use client";

import { Loader2, RotateCcw, Square, Trash2, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";

import { DeployButton } from "@/components/atlas/deploy-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  deleteSpace,
  recreateSpace,
  shareSpace,
  stopSpace,
  type ActionResult,
} from "./actions";

export type SpaceView = {
  id: string;
  slug: string;
  status: string;
  stopped: boolean;
  createdAt: string;
  ports: { port: number; url: string | null }[];
  scope: { kind: "group"; name: string; slug: string } | { kind: "personal" };
  members: { email: string; name: string | null; role: string }[];
  device: { label: string; platform: string | null } | null;
};

const STATUS_TONE: Record<string, string> = {
  running: "bg-emerald-500",
  provisioning: "bg-amber-500",
  suspended: "bg-sky-500",
  stopped: "bg-muted-foreground/40",
  error: "bg-red-500",
};

export function SpaceCard({ space }: { space: SpaceView }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState<"stop" | "delete" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setResult(await fn());
      setConfirming(null);
    });

  return (
    <div className="border-border rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATUS_TONE[space.status] ?? "bg-muted-foreground/40",
              )}
            />
            <p className="truncate font-mono text-sm">{space.slug}</p>
            <span className="text-muted-foreground text-xs">{space.status}</span>
          </div>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {space.scope.kind === "group" ? space.scope.name : "Personal"}
            {space.device ? ` · created from ${space.device.label}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Who can reach this space, and from where. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`People with access to ${space.slug}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/30 inline-flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-3"
            >
              <Users className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>
                Access · {space.members.length}{" "}
                {space.members.length === 1 ? "person" : "people"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ul className="max-h-56 overflow-y-auto px-2 py-1">
                {space.members.map((m) => (
                  <li key={m.email} className="py-1.5">
                    <p className="truncate text-sm">{m.name ?? m.email}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {m.name ? `${m.email} · ` : ""}
                      {m.role}
                    </p>
                  </li>
                ))}
              </ul>
              <DropdownMenuSeparator />
              <p className="text-muted-foreground px-3 py-2 text-xs leading-5">
                {space.device
                  ? `Provisioned from ${space.device.label}${
                      space.device.platform ? ` (${space.device.platform})` : ""
                    }.`
                  : "No device recorded for this space."}{" "}
                Manage your own devices in Settings.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>

          {!space.stopped && (
            <DeployButton machineId={space.id} className="rounded-full" />
          )}

          {!space.stopped && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={pending}
              onClick={() => setInviteOpen((v) => !v)}
            >
              <UserPlus className="size-3.5" />
              Share
            </Button>
          )}

          {space.stopped ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                disabled={pending}
                onClick={() => run(() => recreateSpace(space.id))}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Recreate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground rounded-full"
                disabled={pending}
                onClick={() =>
                  confirming === "delete"
                    ? run(() => deleteSpace(space.id))
                    : setConfirming("delete")
                }
              >
                <Trash2 className="size-3.5" />
                {confirming === "delete" ? "Confirm" : "Delete"}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={pending}
              onClick={() =>
                confirming === "stop"
                  ? run(() => stopSpace(space.id))
                  : setConfirming("stop")
              }
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
              {confirming === "stop" ? "Confirm" : "Stop"}
            </Button>
          )}
        </div>
      </div>

      {/* The one thing a user must know before stopping, said before they do. */}
      {confirming === "stop" && (
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
          Stopping destroys this machine&apos;s filesystem. There is no resume —
          recreating gives you an empty one. Pull anything you need out first
          with <code className="font-mono">atlas get {space.slug} &lt;path&gt;</code>.
        </p>
      )}

      {confirming === "delete" && (
        <p className="text-muted-foreground mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-5">
          Removes the record of {space.slug}. The machine itself is already gone.
        </p>
      )}

      {inviteOpen && !space.stopped && (
        <InviteForm
          space={space}
          pending={pending}
          onSubmit={(email, role) => run(() => shareSpace(space.id, email, role))}
        />
      )}

      {space.ports.length > 0 && !space.stopped && (
        <div className="mt-3 flex flex-wrap gap-2">
          {space.ports.map((p) =>
            p.url ? (
              <a
                key={p.port}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="border-border text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-1 font-mono text-xs underline-offset-4 hover:underline"
              >
                :{p.port}
              </a>
            ) : (
              <span
                key={p.port}
                className="border-border text-muted-foreground rounded-full border px-2.5 py-1 font-mono text-xs"
              >
                :{p.port}
              </span>
            ),
          )}
        </div>
      )}

      {result && (
        <p
          className={cn(
            "mt-3 text-xs leading-5",
            result.ok ? "text-muted-foreground" : "text-red-600 dark:text-red-400",
          )}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

const ROLES = ["viewer", "operator", "builder", "owner"] as const;

/**
 * Sharing a space is inviting someone to the group that owns it — there is no
 * per-machine ACL, so the form says which group they are actually joining
 * rather than implying the grant stops at this one machine.
 */
function InviteForm({
  space,
  pending,
  onSubmit,
}: {
  space: SpaceView;
  pending: boolean;
  onSubmit: (email: string, role: (typeof ROLES)[number]) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("operator");

  if (space.scope.kind !== "group") {
    return (
      <p className="text-muted-foreground mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-5">
        This is a personal space, so there is no group to add anyone to. Run{" "}
        <code className="font-mono">atlas group create &quot;My Team&quot;</code>{" "}
        and create the space there to share it.
      </p>
    );
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) onSubmit(email.trim(), role);
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="teammate@example.com"
        aria-label={`Email to invite to ${space.scope.name}`}
        className="border-border bg-background focus-visible:ring-ring/30 min-w-0 flex-1 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-3"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
        aria-label="Role"
        className="border-border bg-background focus-visible:ring-ring/30 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-3"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Invite
      </Button>
      <p className="text-muted-foreground w-full text-xs leading-5">
        They join <strong>{space.scope.name}</strong> and can reach every space
        in it, not just {space.slug}.
      </p>
    </form>
  );
}

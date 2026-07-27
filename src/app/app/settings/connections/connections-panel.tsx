"use client";

import { Check, GitBranch, Loader2, Rocket, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

type ConnectionRow = {
  provider: "github" | "railway";
  login: string | null;
  connectedAt: string;
};

export function ConnectionsPanel({
  initial,
  githubConfigured,
  spaces,
  notice,
}: {
  initial: ConnectionRow[];
  githubConfigured: boolean;
  spaces: { id: string; slug: string }[];
  notice: { kind: string; login: string | null; reason: string | null } | null;
}) {
  const utils = api.useUtils();
  const list = api.connection.list.useQuery(undefined, {
    initialData: { connections: initial as never, githubConfigured },
  });
  const connected = new Map(
    (list.data?.connections ?? []).map((c) => [c.provider, c]),
  );

  const disconnect = api.connection.disconnect.useMutation({
    onSuccess: () => utils.connection.invalidate(),
  });

  return (
    <div className="mt-8 space-y-8">
      {notice ? <Notice notice={notice} /> : null}

      <Section
        icon={<GitBranch className="size-4" aria-hidden="true" />}
        title="GitHub"
        subtitle="Clone your repositories into a space, private ones included."
        status={
          connected.has("github")
            ? `Connected as ${connected.get("github")!.login ?? "GitHub user"}`
            : null
        }
      >
        {connected.has("github") ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => disconnect.mutate({ provider: "github" })}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
            <CloneRepo spaces={spaces} />
          </div>
        ) : list.data?.githubConfigured ? (
          <Button nativeButton={false} render={<a href="/api/github/connect" />}>
            <GitBranch className="mr-1.5 size-4" aria-hidden="true" />
            Connect GitHub
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            This deployment has no GitHub OAuth app configured. Set
            GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.
          </p>
        )}
      </Section>

      <Section
        icon={<Rocket className="size-4" aria-hidden="true" />}
        title="Railway"
        subtitle="Deploy a space's Dockerfile to Railway and get a public URL."
        status={connected.has("railway") ? "Project token saved" : null}
      >
        <RailwayForm
          connected={connected.has("railway")}
          onDisconnect={() => disconnect.mutate({ provider: "railway" })}
        />
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border rounded-2xl border p-5">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
          {status ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden="true" />
              {status}
            </p>
          ) : null}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Notice({
  notice,
}: {
  notice: { kind: string; login: string | null; reason: string | null };
}) {
  const ok = notice.kind === "connected";
  return (
    <p
      role="status"
      className={
        ok
          ? "rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300"
          : "rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300"
      }
    >
      {ok
        ? `GitHub connected as ${notice.login ?? "your account"}.`
        : notice.kind === "denied"
          ? "GitHub connection cancelled."
          : `GitHub connection failed: ${notice.reason ?? "unknown error"}.`}
    </p>
  );
}

function RailwayForm({
  connected,
  onDisconnect,
}: {
  connected: boolean;
  onDisconnect: () => void;
}) {
  const utils = api.useUtils();
  const [token, setToken] = useState("");
  const save = api.connection.connectRailway.useMutation({
    onSuccess: () => {
      setToken("");
      void utils.connection.invalidate();
    },
  });

  if (connected) {
    return (
      <Button variant="ghost" onClick={onDisconnect}>
        Disconnect
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) save.mutate({ token });
      }}
    >
      <Input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Railway project token"
        className="flex-1"
        autoComplete="off"
      />
      <Button type="submit" disabled={!token.trim() || save.isPending}>
        {save.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          "Save"
        )}
      </Button>
      {save.error ? (
        <p className="text-destructive text-xs">{save.error.message}</p>
      ) : null}
    </form>
  );
}

function CloneRepo({ spaces }: { spaces: { id: string; slug: string }[] }) {
  const [open, setOpen] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [filter, setFilter] = useState("");
  const repos = api.connection.repos.useQuery(undefined, { enabled: open });
  const clone = api.space.cloneRepo.useMutation();

  if (!spaces.length) {
    return (
      <p className="text-muted-foreground text-xs">
        Create a space to clone into.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Clone a repo into a space
      </Button>
    );
  }

  const matches = (repos.data ?? [])
    .filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 25);

  return (
    <div className="border-border mt-2 w-full rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="border-border bg-background h-8 rounded-md border px-2 text-xs"
          aria-label="Space to clone into"
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.slug}
            </option>
          ))}
        </select>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter repositories"
          className="h-8 flex-1 text-xs"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {repos.isLoading ? (
        <p className="text-muted-foreground mt-3 text-xs">Loading repos…</p>
      ) : repos.error ? (
        <p className="text-destructive mt-3 text-xs">{repos.error.message}</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {matches.map((r) => (
            <li
              key={r.fullName}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate text-xs">
                {r.fullName}
                {r.private ? (
                  <span className="text-muted-foreground ml-1.5">private</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={clone.isPending || !spaceId}
                onClick={() =>
                  clone.mutate({
                    machineId: spaceId,
                    fullName: r.fullName,
                    branch: r.defaultBranch,
                  })
                }
              >
                {clone.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Clone"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {clone.data ? (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Cloned into {clone.data.dir}/
        </p>
      ) : null}
      {clone.error ? (
        <p className="text-destructive mt-2 text-xs">{clone.error.message}</p>
      ) : null}
    </div>
  );
}

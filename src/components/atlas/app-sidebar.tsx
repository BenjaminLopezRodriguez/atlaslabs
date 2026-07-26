"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Persistent chat shell sidebar: new specialist, workspace switcher, and the
 * threads of whichever workspace the URL is pointing at (falling back to
 * personal so /app itself is never an empty rail).
 */
export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string; threadId?: string }>();

  const workspaces = api.workspace.list.useQuery();
  const workspaceId = params.workspaceId ?? workspaces.data?.personal.id;
  const threads = api.thread.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: Boolean(workspaceId) },
  );

  return (
    <aside className="border-border bg-card/40 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-12 items-center px-3">
        <Link
          href="/app"
          className="text-foreground text-[13px] font-medium tracking-tight"
        >
          atlas
        </Link>
      </div>

      <Link
        href="/"
        className="text-foreground hover:bg-muted mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
      >
        <Plus className="size-4" aria-hidden="true" />
        New
      </Link>

      <nav aria-label="Workspaces" className="mt-4 px-2">
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">
          Workspaces
        </h2>
        <ul className="mt-1 space-y-0.5">
          {workspaces.data && (
            <WorkspaceLink
              href={`/app/w/${workspaces.data.personal.id}`}
              label="Personal"
              active={workspaceId === workspaces.data.personal.id}
            />
          )}
          {workspaces.data?.groupWorkspaces.map((ws) => (
            <WorkspaceLink
              key={ws.id}
              href={`/app/w/${ws.id}`}
              label={ws.group?.name ?? ws.name}
              active={workspaceId === ws.id}
            />
          ))}
        </ul>
      </nav>

      <nav aria-label="Threads" className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">
          Threads
        </h2>
        {threads.isPending && workspaceId ? (
          <ul className="mt-2 space-y-1.5 px-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="bg-muted h-4 animate-pulse rounded" />
            ))}
          </ul>
        ) : threads.data?.length ? (
          <ul className="mt-1 space-y-0.5">
            {threads.data.map((t) => {
              const href = `/app/w/${workspaceId}/t/${t.id}`;
              return (
                <li key={t.id}>
                  <Link
                    href={href}
                    className={cn(
                      "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
                      pathname === href
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    {t.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-1 px-2 text-[13px]">
            No threads yet.
          </p>
        )}
      </nav>
    </aside>
  );
}

function WorkspaceLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        {label}
      </Link>
    </li>
  );
}

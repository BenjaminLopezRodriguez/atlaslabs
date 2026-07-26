"use client";

import Link from "next/link";

import { api } from "@/trpc/react";

export function WorkspaceView({ workspaceId }: { workspaceId: string }) {
  const ws = api.workspace.get.useQuery({ workspaceId });
  const specialists = api.specialist.list.useQuery({ workspaceId });
  const threads = api.thread.list.useQuery({ workspaceId });

  if (ws.isError) {
    return (
      <p role="alert" className="text-destructive px-6 py-10 text-sm">
        {ws.error.message}
      </p>
    );
  }

  return (
    <div className="text-foreground">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Sidebar covers this at md+; keep an escape hatch while it's hidden. */}
          <Link
            href="/app"
            className="text-muted-foreground hover:text-foreground text-[13px] md:hidden"
          >
            ← Workspaces
          </Link>
          <h1 className="text-sm font-medium tracking-tight">
            {ws.data?.workspace.name ?? "…"}
          </h1>
        </div>
        {ws.data && (
          <span className="text-muted-foreground text-[12px]">
            role: {ws.data.role}
          </span>
        )}
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <section>
          <h2 className="text-muted-foreground text-[13px] font-medium">
            Specialists
          </h2>
          <ul className="mt-2 space-y-1.5">
            {specialists.data?.map((s) => (
              <li
                key={s.id}
                className="border-border flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-muted-foreground line-clamp-1 text-[12px]">
                    {s.purpose}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                  {s.state}
                </span>
              </li>
            ))}
            {specialists.data?.length === 0 && (
              <li className="text-muted-foreground text-sm">
                No specialists yet.{" "}
                <Link href="/" className="underline">
                  Start one from the homepage prompt.
                </Link>
              </li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-muted-foreground text-[13px] font-medium">
            Threads
          </h2>
          <ul className="mt-2 space-y-1.5">
            {threads.data?.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/w/${workspaceId}/t/${t.id}`}
                  className="border-border hover:border-foreground/25 block rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t.title}
                </Link>
              </li>
            ))}
            {threads.data?.length === 0 && (
              <li className="text-muted-foreground text-sm">No threads yet.</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

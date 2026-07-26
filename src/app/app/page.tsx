import Link from "next/link";

import { api } from "@/trpc/server";

export default async function AppHome() {
  const { personal, groupWorkspaces } = await api.workspace.list();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-sm font-medium tracking-tight">Atlas</h1>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-[13px]"
        >
          New specialist
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h2 className="text-muted-foreground text-[13px] font-medium">
          Workspaces
        </h2>
        <ul className="mt-2 space-y-1.5">
          <li>
            <Link
              href={`/app/w/${personal.id}`}
              className="border-border hover:border-foreground/25 block rounded-md border px-3 py-2 text-sm transition-colors"
            >
              Personal
            </Link>
          </li>
          {groupWorkspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/app/w/${ws.id}`}
                className="border-border hover:border-foreground/25 block rounded-md border px-3 py-2 text-sm transition-colors"
              >
                {ws.group?.name ?? ws.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

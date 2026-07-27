import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { listConnections } from "@/server/connections";
import { githubConfigured } from "@/server/github";
import { listMachines } from "@/server/machines/store";

import { ConnectionsPanel } from "./connections-panel";

export const metadata = { title: "Connections · Atlas" };

/**
 * GitHub and Railway, the two credentials a space needs to pull code in and
 * push a site out.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; login?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [connections, machines] = await Promise.all([
    listConnections(user.id),
    listMachines(user.id),
  ]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-xl font-medium tracking-tight">Connections</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Accounts your spaces can act on. Tokens are encrypted at rest and are
          never written into a command your space records.
        </p>

        <ConnectionsPanel
          initial={connections.map((c) => ({
            provider: c.provider,
            login: c.login,
            connectedAt: c.connectedAt.toISOString(),
          }))}
          githubConfigured={githubConfigured()}
          spaces={machines.map((m) => ({ id: m.id, slug: m.slug }))}
          notice={
            params.github
              ? {
                  kind: params.github,
                  login: params.login ?? null,
                  reason: params.reason ?? null,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

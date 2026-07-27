import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import {
  devices,
  groups,
  memberships,
  users,
  workspaces,
} from "@/server/db/schema";
import { listMachines } from "@/server/machines/store";

import { SpaceCard, type SpaceView } from "./space-card";

export const metadata = { title: "Spaces · Atlas" };

/**
 * Every machine the caller can reach, grouped by the workspace that owns it.
 *
 * Stopped spaces are included: on the Modal backend stopping is terminal, so
 * the row is the only remaining trace, and it is what you recreate or delete
 * from. Hiding it would just make a stopped space look like a lost one.
 */
export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const { joined } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const machines = await listMachines(user.id, { includeStopped: true });

  const wsIds = [...new Set(machines.map((m) => m.workspaceId))];
  const wsRows = wsIds.length
    ? await db.query.workspaces.findMany({
        where: inArray(workspaces.id, wsIds),
      })
    : [];

  const groupIds = wsRows.map((w) => w.groupId).filter((g): g is string => !!g);
  const groupRows = groupIds.length
    ? await db.query.groups.findMany({ where: inArray(groups.id, groupIds) })
    : [];

  // Who can reach each group's spaces, and which devices provisioned them.
  const memberRows = groupIds.length
    ? await db
        .select({
          groupId: memberships.groupId,
          role: memberships.role,
          email: users.email,
          name: users.name,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(inArray(memberships.groupId, groupIds))
    : [];

  const deviceIds = [
    ...new Set(machines.map((m) => m.createdByDeviceId).filter((d): d is string => !!d)),
  ];
  const deviceRows = deviceIds.length
    ? await db.query.devices.findMany({ where: inArray(devices.id, deviceIds) })
    : [];

  const wsById = new Map(wsRows.map((w) => [w.id, w]));
  const groupById = new Map(groupRows.map((g) => [g.id, g]));
  const deviceById = new Map(deviceRows.map((d) => [d.id, d]));

  const views: SpaceView[] = machines.map((m) => {
    const ws = wsById.get(m.workspaceId);
    const group = ws?.groupId ? groupById.get(ws.groupId) : null;
    const device = m.createdByDeviceId ? deviceById.get(m.createdByDeviceId) : null;
    return {
      id: m.id,
      slug: m.slug,
      status: m.status,
      stopped: !!m.terminatedAt,
      createdAt: m.createdAt.toISOString(),
      ports: m.ports.map((p) => ({ port: p.port, url: p.internalUrl ?? null })),
      scope: group ? { kind: "group", name: group.name, slug: group.slug } : { kind: "personal" },
      members: group
        ? memberRows
            .filter((r) => r.groupId === group.id)
            .map((r) => ({ email: r.email, name: r.name, role: r.role }))
        : [{ email: user.email, name: user.name, role: "owner" }],
      device: device ? { label: device.label, platform: device.platform } : null,
    };
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="text-xl font-medium tracking-tight">Spaces</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cloud machines you and your agents work in. Create them with{" "}
          <code className="font-mono text-xs">atlas machine create &lt;slug&gt;</code>.
        </p>

        {joined ? (
          <p className="border-border bg-muted/40 mt-6 rounded-xl border px-4 py-3 text-sm">
            You joined <strong>{joined}</strong>. Run{" "}
            <code className="font-mono text-xs">atlas group use {joined}</code>{" "}
            to point the CLI at it.
          </p>
        ) : null}

        {views.length === 0 ? (
          <div className="border-border mt-8 rounded-2xl border border-dashed px-6 py-12 text-center">
            <p className="text-sm">No spaces yet.</p>
            <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-xs leading-6">
              Run{" "}
              <code className="font-mono">atlas machine create my-app</code> from
              your terminal, or ask an agent to. It shows up here.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {views.map((v) => (
              <li key={v.id}>
                <SpaceCard space={v} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

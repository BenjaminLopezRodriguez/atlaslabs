import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { cliTokens } from "@/server/db/schema";
import { listDevices, revokeDevice } from "@/server/devices/store";

import { RevokeDeviceButton } from "./revoke-device-button";

export const metadata = { title: "Settings · Atlas" };

/**
 * Account settings: who you are, and what currently holds a session in your
 * name. Signing a device out is the one action here, so it is the only thing
 * that gets a button.
 */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [devices, tokens] = await Promise.all([
    listDevices(user.id),
    db.query.cliTokens.findMany({
      where: and(eq(cliTokens.userId, user.id), isNull(cliTokens.revokedAt)),
      orderBy: [desc(cliTokens.lastUsedAt)],
    }),
  ]);

  const tokensByDevice = new Map<string, number>();
  for (const t of tokens) {
    if (t.deviceId) {
      tokensByDevice.set(t.deviceId, (tokensByDevice.get(t.deviceId) ?? 0) + 1);
    }
  }

  async function revoke(deviceId: string) {
    "use server";
    const current = await getSessionUser();
    if (!current) redirect("/sign-in");
    // Scoped to the caller: revokeDevice returns false for someone else's id.
    await revokeDevice({ userId: current.id, deviceId });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-xl font-medium tracking-tight">Settings</h1>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Profile</h2>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="truncate text-sm">{user.name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="truncate text-sm">{user.email}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-2 text-xs">
            Name and email come from your sign-in provider. Change them there.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Connections</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            GitHub and Railway — what your spaces can pull code from and deploy
            to.
          </p>
          <a
            href="/app/settings/connections"
            className="mt-3 inline-block text-sm underline"
          >
            Manage connections
          </a>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Devices</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Every browser session and CLI login is its own device. Signing one
            out revokes the tokens minted for it.
          </p>

          {devices.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No devices yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {d.label}
                      {d.revokedAt ? (
                        <span className="text-muted-foreground"> · revoked</span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[
                        d.kind,
                        d.platform,
                        d.lastSeenAt
                          ? `last used ${d.lastSeenAt.toLocaleDateString()}`
                          : null,
                        tokensByDevice.get(d.id)
                          ? `${tokensByDevice.get(d.id)} active token${
                              tokensByDevice.get(d.id) === 1 ? "" : "s"
                            }`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {d.revokedAt ? null : (
                    <RevokeDeviceButton
                      isCurrent={d.id === user.deviceId}
                      action={revoke.bind(null, d.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">CLI</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {tokens.length === 0
              ? "No active CLI tokens. Run `atlas login` to connect one."
              : `${tokens.length} active token${tokens.length === 1 ? "" : "s"}. Revoke one by signing its device out above, or run \`atlas logout\`.`}
          </p>
        </section>
      </div>
    </div>
  );
}

import { and, eq } from "drizzle-orm";

import { db as database } from "@/server/db";
import { connections, type ConnectionProvider } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto";

type Db = typeof database;

export type ConnectionSummary = {
  provider: ConnectionProvider;
  login: string | null;
  externalId: string | null;
  connectedAt: Date;
};

export async function saveConnection(
  input: {
    userId: string;
    provider: ConnectionProvider;
    accessToken: string;
    externalId?: string | null;
    login?: string | null;
    scope?: string | null;
  },
  db: Db = database,
): Promise<void> {
  const row = {
    accessToken: encryptSecret(input.accessToken),
    externalId: input.externalId ?? null,
    login: input.login ?? null,
    scope: input.scope ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(connections)
    .values({ userId: input.userId, provider: input.provider, ...row })
    // Re-connecting replaces the token rather than erroring: users re-run the
    // OAuth flow precisely when their old token stopped working.
    .onConflictDoUpdate({
      target: [connections.userId, connections.provider],
      set: row,
    });
}

/** The decrypted token, or null when the user has not connected this provider. */
export async function getConnectionToken(
  userId: string,
  provider: ConnectionProvider,
  db: Db = database,
): Promise<string | null> {
  const row = await db.query.connections.findFirst({
    where: and(
      eq(connections.userId, userId),
      eq(connections.provider, provider),
    ),
  });
  return row ? decryptSecret(row.accessToken) : null;
}

export async function listConnections(
  userId: string,
  db: Db = database,
): Promise<ConnectionSummary[]> {
  const rows = await db.query.connections.findMany({
    where: eq(connections.userId, userId),
    // Never select the token for a listing — this feeds the UI.
    columns: {
      provider: true,
      login: true,
      externalId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    provider: r.provider,
    login: r.login,
    externalId: r.externalId,
    connectedAt: r.createdAt,
  }));
}

export async function deleteConnection(
  userId: string,
  provider: ConnectionProvider,
  db: Db = database,
): Promise<void> {
  await db
    .delete(connections)
    .where(
      and(eq(connections.userId, userId), eq(connections.provider, provider)),
    );
}

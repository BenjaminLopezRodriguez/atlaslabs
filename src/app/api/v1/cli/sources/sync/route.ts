import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/server/audit";
import { requireWorkspaceAccess } from "@/server/authz";
import { db } from "@/server/db";
import { sourceFiles, sourceVersions, sources } from "@/server/db/schema";
import { isSecretPath, looksLikeSecretContent } from "@/server/sources/secrets";

import { requireCli, toHttpError, unauthorized } from "../../helpers";

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const bodySchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(256),
  /** Provenance, e.g. `repo:acme/api` or an absolute local path. */
  origin: z.string().min(1).max(1024),
  syncRules: z
    .object({ include: z.array(z.string()), exclude: z.array(z.string()) })
    .optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        /** base64 file body. */
        content: z.string(),
      }),
    )
    .max(MAX_FILES),
});

const sha256 = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");

/**
 * Push a snapshot of an approved local source. Secret-looking paths and
 * contents are rejected outright — the sync fails so the operator notices,
 * rather than silently dropping files.
 */
export async function POST(req: Request) {
  const user = await requireCli(req);
  if (!user) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const { workspace } = await requireWorkspaceAccess(
      db,
      user.id,
      input.workspaceId,
      "builder",
    );

    const rejected: { path: string; reason: string }[] = [];
    const accepted: { path: string; content: string; bytes: number }[] = [];
    let totalBytes = 0;

    for (const f of input.files) {
      const norm = f.path.replace(/\\/g, "/").replace(/^\.\//, "");
      if (norm.includes("..")) {
        rejected.push({ path: f.path, reason: "path traversal" });
        continue;
      }
      if (isSecretPath(norm)) {
        rejected.push({ path: norm, reason: "secret or excluded path" });
        continue;
      }
      const buf = Buffer.from(f.content, "base64");
      if (buf.byteLength > MAX_FILE_BYTES) {
        rejected.push({ path: norm, reason: "file too large" });
        continue;
      }
      const text = buf.toString("utf8");
      if (looksLikeSecretContent(text)) {
        rejected.push({ path: norm, reason: "likely secret content" });
        continue;
      }
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return Response.json(
          { error: "payload_too_large", limitBytes: MAX_TOTAL_BYTES },
          { status: 413 },
        );
      }
      accepted.push({ path: norm, content: text, bytes: buf.byteLength });
    }

    if (rejected.length > 0) {
      return Response.json(
        {
          error: "files_rejected",
          rejected,
          hint: "Add these paths to `exclude` in atlas.yaml, or remove the secrets.",
        },
        { status: 422 },
      );
    }
    if (accepted.length === 0) {
      return Response.json({ error: "no_files" }, { status: 400 });
    }

    const contentHash = sha256(
      accepted
        .map((f) => `${f.path}\0${sha256(f.content)}`)
        .sort()
        .join("\n"),
    );

    const result = await db.transaction(async (tx) => {
      let source = await tx.query.sources.findFirst({
        where: and(
          eq(sources.workspaceId, workspace.id),
          eq(sources.origin, input.origin),
        ),
      });
      if (!source) {
        const [created] = await tx
          .insert(sources)
          .values({
            workspaceId: workspace.id,
            kind: "repository",
            name: input.name,
            origin: input.origin,
            syncRules: input.syncRules,
            status: "syncing",
            addedByUserId: user.id,
          })
          .returning();
        source = created!;
      }

      const prev = await tx.query.sourceVersions.findFirst({
        where: eq(sourceVersions.sourceId, source.id),
        orderBy: (v, { desc }) => desc(v.version),
      });
      if (prev?.contentHash === contentHash) {
        return { source, version: prev, unchanged: true as const };
      }

      const [version] = await tx
        .insert(sourceVersions)
        .values({
          sourceId: source.id,
          version: (prev?.version ?? 0) + 1,
          fileCount: accepted.length,
          totalBytes,
          contentHash,
          syncedByUserId: user.id,
          syncedByDeviceId: user.deviceId,
        })
        .returning();
      await tx.insert(sourceFiles).values(
        accepted.map((f) => ({
          sourceVersionId: version!.id,
          path: f.path,
          contentHash: sha256(f.content),
          bytes: f.bytes,
          content: f.content,
        })),
      );
      await tx
        .update(sources)
        .set({
          currentVersionId: version!.id,
          status: "ready",
          syncRules: input.syncRules ?? source.syncRules,
        })
        .where(eq(sources.id, source.id));
      return { source, version: version!, unchanged: false as const };
    });

    await audit({
      action: "source.sync",
      groupId: workspace.groupId,
      userId: user.id,
      deviceId: user.deviceId,
      detail: {
        type: "source",
        id: result.source.id,
        version: result.version.version,
        fileCount: accepted.length,
        totalBytes,
        unchanged: result.unchanged,
      },
    });

    return Response.json({
      sourceId: result.source.id,
      version: result.version.version,
      fileCount: accepted.length,
      totalBytes,
      unchanged: result.unchanged,
    });
  } catch (err) {
    return toHttpError(err);
  }
}

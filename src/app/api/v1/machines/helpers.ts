import { TRPCError } from "@trpc/server";

import { DriverError } from "@/server/machines/driver";
import { InvalidSlugError } from "@/server/machines/slug";
import { MachineConflictError } from "@/server/machines/store";

export { requireCli, unauthorized } from "../cli/helpers";

/** A machine that is absent and one the caller may not see are indistinguishable. */
export function notFound() {
  return Response.json({ error: "machine_not_found" }, { status: 404 });
}

/** Machine-specific error mapping, layered over the shared CLI mapping. */
export function toMachineHttpError(err: unknown): Response {
  if (err instanceof MachineConflictError) {
    return Response.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof InvalidSlugError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof DriverError) {
    return Response.json({ error: err.message }, { status: 502 });
  }
  if (err instanceof TRPCError) {
    const status =
      err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 400;
    return Response.json({ error: err.message }, { status });
  }
  console.error("[machines-api]", err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}

/** Shape sent to clients. Never leaks the driver handle. */
export function serialize(m: {
  id: string;
  slug: string;
  name: string | null;
  status: string;
  templateId: string | null;
  region: string | null;
  ports: unknown;
  workspaceId: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  suspendedAt: Date | null;
}) {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    status: m.status,
    templateId: m.templateId,
    region: m.region,
    ports: m.ports,
    workspaceId: m.workspaceId,
    createdAt: m.createdAt,
    lastSeenAt: m.lastSeenAt,
    suspendedAt: m.suspendedAt,
    url: `atlas://workspace/${m.slug}`,
  };
}

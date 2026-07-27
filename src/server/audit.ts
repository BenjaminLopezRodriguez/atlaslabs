import { db } from "@/server/db";
import { auditEvents } from "@/server/db/schema";

/**
 * Append-only audit trail for sensitive actions. Never throws — auditing
 * must not take down the action it records — but logs loudly on failure.
 */
export async function audit(event: {
  action: string;
  detail: Record<string, unknown>;
  groupId?: string | null;
  userId?: string | null;
  serviceKeyId?: string | null;
  /** Which device acted. Absent for service-key and system-initiated actions. */
  deviceId?: string | null;
}) {
  try {
    await db.insert(auditEvents).values({
      action: event.action,
      detail: event.detail,
      groupId: event.groupId ?? null,
      userId: event.userId ?? null,
      serviceKeyId: event.serviceKeyId ?? null,
      deviceId: event.deviceId ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record", event.action, err);
  }
}

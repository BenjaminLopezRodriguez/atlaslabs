import { relations } from "drizzle-orm";
import {
  index,
  pgTableCreator,
  primaryKey,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const createTable = pgTableCreator((name) => `atlas_${name}`);

const id = () => crypto.randomUUID();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull();

/* ------------------------------------------------------------------ */
/* Users (identity lives in WorkOS AuthKit; this row anchors FKs)      */
/* ------------------------------------------------------------------ */

export const users = createTable("user", (d) => ({
  /** WorkOS user id (`user_…`). */
  id: d.varchar({ length: 64 }).primaryKey(),
  name: d.varchar({ length: 256 }),
  email: d.varchar({ length: 320 }).notNull().unique(),
  image: d.varchar({ length: 512 }),
  createdAt: createdAt(),
}));

/* ------------------------------------------------------------------ */
/* Groups, memberships, workspaces                                     */
/* ------------------------------------------------------------------ */

export type MembershipRole = "owner" | "builder" | "operator" | "viewer";

export const groups = createTable(
  "group",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    name: d.varchar({ length: 256 }).notNull(),
    slug: d.varchar({ length: 128 }).notNull(),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [uniqueIndex("group_slug_idx").on(t.slug)],
);

export const memberships = createTable(
  "membership",
  (d) => ({
    groupId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: d.varchar({ length: 16 }).$type<MembershipRole>().notNull(),
    createdAt: createdAt(),
  }),
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("membership_user_idx").on(t.userId),
  ],
);

/** Expiring, revocable e-mail invitations into a group. */
export const invitations = createTable(
  "invitation",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    groupId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: d.varchar({ length: 320 }).notNull(),
    role: d.varchar({ length: 16 }).$type<MembershipRole>().notNull(),
    tokenHash: d.varchar({ length: 64 }).notNull(),
    invitedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    acceptedAt: d.timestamp({ withTimezone: true }),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [
    uniqueIndex("invitation_token_idx").on(t.tokenHash),
    index("invitation_group_idx").on(t.groupId),
  ],
);

/**
 * A workspace is personal (userId set, groupId null) or group-owned
 * (groupId set). Exactly one of the two is non-null; authorization derives
 * from that owner.
 */
export const workspaces = createTable(
  "workspace",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    name: d.varchar({ length: 256 }).notNull(),
    userId: d.varchar({ length: 64 }).references(() => users.id, {
      onDelete: "cascade",
    }),
    groupId: d.varchar({ length: 64 }).references(() => groups.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
  }),
  (t) => [
    index("workspace_user_idx").on(t.userId),
    index("workspace_group_idx").on(t.groupId),
  ],
);

/* ------------------------------------------------------------------ */
/* Specialists                                                         */
/* ------------------------------------------------------------------ */

export type SpecialistState =
  "draft" | "configuring" | "evaluating" | "ready" | "deployed" | "deprecated";

export const specialists = createTable(
  "specialist",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    workspaceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 256 }).notNull(),
    slug: d.varchar({ length: 128 }).notNull(),
    purpose: d.text().notNull(),
    state: d
      .varchar({ length: 16 })
      .$type<SpecialistState>()
      .notNull()
      .default("draft"),
    currentVersionId: d.varchar({ length: 64 }),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("specialist_workspace_idx").on(t.workspaceId),
    uniqueIndex("specialist_slug_idx").on(t.workspaceId, t.slug),
  ],
);

/** Immutable manifest snapshot. The manifest jsonb is the full spec §5 shape. */
export const specialistVersions = createTable(
  "specialist_version",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    version: d.integer().notNull(),
    manifest: d.jsonb().$type<Record<string, unknown>>().notNull(),
    changeSummary: d.varchar({ length: 512 }),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [uniqueIndex("specialist_version_idx").on(t.specialistId, t.version)],
);

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export const threads = createTable(
  "thread",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    workspaceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    specialistId: d.varchar({ length: 64 }).references(() => specialists.id, {
      onDelete: "set null",
    }),
    title: d.varchar({ length: 256 }).notNull().default("New thread"),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [index("thread_workspace_idx").on(t.workspaceId)],
);

export type MessageRole = "user" | "assistant" | "system";

export const messages = createTable(
  "message",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    threadId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    seq: d.integer().notNull(),
    role: d.varchar({ length: 16 }).$type<MessageRole>().notNull(),
    authorUserId: d.varchar({ length: 64 }).references(() => users.id),
    content: d.text().notNull(),
    /** Tool calls, run references, artifacts — UI payload. */
    meta: d.jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  }),
  (t) => [uniqueIndex("message_thread_seq_idx").on(t.threadId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export type SourceKind = "repository" | "documents" | "upload" | "url" | "note";
export type SourceStatus = "pending" | "syncing" | "ready" | "revoked";

export const sources = createTable(
  "source",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    workspaceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: d.varchar({ length: 16 }).$type<SourceKind>().notNull(),
    name: d.varchar({ length: 256 }).notNull(),
    /** Provenance: where it came from (path, url, upload origin). */
    origin: d.varchar({ length: 1024 }).notNull(),
    /** Include/exclude globs declared by atlas.yaml. */
    syncRules: d.jsonb().$type<{ include: string[]; exclude: string[] }>(),
    status: d
      .varchar({ length: 16 })
      .$type<SourceStatus>()
      .notNull()
      .default("pending"),
    currentVersionId: d.varchar({ length: 64 }),
    addedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [index("source_workspace_idx").on(t.workspaceId)],
);

/** Immutable snapshot of a sync. Files live in source_files keyed to this. */
export const sourceVersions = createTable(
  "source_version",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    sourceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    version: d.integer().notNull(),
    fileCount: d.integer().notNull(),
    totalBytes: d.integer().notNull(),
    /** sha256 of sorted (path, contentHash) pairs. */
    contentHash: d.varchar({ length: 64 }).notNull(),
    syncedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    /**
     * Which device uploaded this version. Provenance belongs on the artifact
     * here, not only on an audit event — "where did this content come from" is
     * a property of the version itself. This is the ONLY domain table that gets
     * a device column; everything else attributes through auditEvents.
     */
    syncedByDeviceId: d.varchar({ length: 64 }),
    createdAt: createdAt(),
  }),
  (t) => [uniqueIndex("source_version_idx").on(t.sourceId, t.version)],
);

export const sourceFiles = createTable(
  "source_file",
  (d) => ({
    sourceVersionId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "cascade" }),
    path: d.varchar({ length: 1024 }).notNull(),
    contentHash: d.varchar({ length: 64 }).notNull(),
    bytes: d.integer().notNull(),
    content: d.text().notNull(),
  }),
  (t) => [primaryKey({ columns: [t.sourceVersionId, t.path] })],
);

/** Which specialists may read which sources. */
export const sourcePermissions = createTable(
  "source_permission",
  (d) => ({
    sourceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    grantedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [primaryKey({ columns: [t.sourceId, t.specialistId] })],
);

/* ------------------------------------------------------------------ */
/* Memory & corrections                                                */
/* ------------------------------------------------------------------ */

export type MemoryScope = "personal" | "group";

export const memories = createTable(
  "memory",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    workspaceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    specialistId: d.varchar({ length: 64 }).references(() => specialists.id, {
      onDelete: "cascade",
    }),
    scope: d.varchar({ length: 16 }).$type<MemoryScope>().notNull(),
    text: d.text().notNull(),
    /** Set when promoted from a personal workspace: exact provenance. */
    promotedFromMemoryId: d.varchar({ length: 64 }),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [index("memory_workspace_idx").on(t.workspaceId)],
);

export type CorrectionKind =
  | "accepted"
  | "rejected"
  | "edited"
  | "preferred_alternative"
  | "policy_violation"
  | "missing_context"
  | "reusable_instruction";
export type CorrectionPromotion = "example" | "evaluation" | "memory";

export const corrections = createTable(
  "correction",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    runId: d.varchar({ length: 64 }),
    messageId: d.varchar({ length: 64 }),
    kind: d.varchar({ length: 32 }).$type<CorrectionKind>().notNull(),
    note: d.text().notNull().default(""),
    /** Edited/preferred replacement output when applicable. */
    replacement: d.text(),
    /** Null until explicitly promoted. */
    promotedTo: d.varchar({ length: 16 }).$type<CorrectionPromotion>(),
    promotedAt: d.timestamp({ withTimezone: true }),
    promotedByUserId: d.varchar({ length: 64 }).references(() => users.id),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [index("correction_specialist_idx").on(t.specialistId)],
);

/* ------------------------------------------------------------------ */
/* Evaluations                                                         */
/* ------------------------------------------------------------------ */

export const evaluationSuites = createTable(
  "evaluation_suite",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 256 }).notNull(),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [index("eval_suite_specialist_idx").on(t.specialistId)],
);

export const evaluationCases = createTable(
  "evaluation_case",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    suiteId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => evaluationSuites.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 256 }).notNull(),
    input: d.jsonb().$type<Record<string, unknown>>().notNull(),
    /** Expected output / grading criteria. */
    expectation: d.text().notNull(),
    /** Correction this case was promoted from, when applicable. */
    fromCorrectionId: d.varchar({ length: 64 }),
    critical: d.boolean().notNull().default(false),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [index("eval_case_suite_idx").on(t.suiteId)],
);

export type EvaluationRunStatus = "pending" | "running" | "passed" | "failed";

/** Immutable result of running a suite against a specialist version. */
export const evaluationRuns = createTable(
  "evaluation_run",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    suiteId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => evaluationSuites.id, { onDelete: "cascade" }),
    specialistVersionId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialistVersions.id, { onDelete: "cascade" }),
    status: d
      .varchar({ length: 16 })
      .$type<EvaluationRunStatus>()
      .notNull()
      .default("pending"),
    passedCases: d.integer().notNull().default(0),
    failedCases: d.integer().notNull().default(0),
    /** Per-case results: [{caseId, passed, output, notes}]. */
    results: d.jsonb().$type<Record<string, unknown>[]>(),
    startedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("eval_run_version_idx").on(t.specialistVersionId)],
);

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export const toolDefinitions = createTable("tool_definition", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
  name: d.varchar({ length: 128 }).notNull().unique(),
  description: d.text().notNull(),
  /** JSON schema of the tool input. */
  inputSchema: d.jsonb().$type<Record<string, unknown>>().notNull(),
  /** Destructive/external tools require human approval per run. */
  requiresApproval: d.boolean().notNull().default(false),
  createdAt: createdAt(),
}));

export const toolGrants = createTable(
  "tool_grant",
  (d) => ({
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    toolId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => toolDefinitions.id, { onDelete: "cascade" }),
    grantedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  }),
  (t) => [primaryKey({ columns: [t.specialistId, t.toolId] })],
);

/* ------------------------------------------------------------------ */
/* Runs & runtimes                                                     */
/* ------------------------------------------------------------------ */

export type RuntimeStatus = "provisioning" | "ready" | "terminated";

export const runtimes = createTable("runtime", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
  /** Adapter kind: `local` today; container/microVM later. */
  kind: d.varchar({ length: 32 }).notNull().default("local"),
  status: d
    .varchar({ length: 16 })
    .$type<RuntimeStatus>()
    .notNull()
    .default("provisioning"),
  /** Adapter-specific handle (process id, container id…). */
  handle: d.varchar({ length: 256 }),
  createdAt: createdAt(),
  terminatedAt: d.timestamp({ withTimezone: true }),
}));

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

/* ------------------------------------------------------------------ */
/* Machines (persistent workspace VMs)                                 */
/* ------------------------------------------------------------------ */

/**
 * A remote VM. NOT a `device` (that is a client the user signs in from).
 *
 * Atlas Browser's user-facing "workspace" is one of these: `atlas://workspace/<slug>`
 * resolves to the machine whose slug matches, within the caller's tenancy
 * `workspaces` row.
 */
export type MachineStatus =
  | "provisioning"
  | "running"
  | "suspended"
  | "stopping"
  | "stopped"
  | "error";

export type MachinePort = {
  port: number;
  label?: string;
  /** Reachable only from inside the VM until port sharing lands. */
  internalUrl?: string;
};

export const machines = createTable(
  "machine",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    workspaceId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** DNS label, unique within the tenancy workspace. */
    slug: d.varchar({ length: 63 }).notNull(),
    name: d.varchar({ length: 256 }),
    templateId: d.varchar({ length: 64 }),
    status: d
      .varchar({ length: 16 })
      .$type<MachineStatus>()
      .notNull()
      .default("provisioning"),
    /** Driver kind + opaque handle. `mock` today; a real driver later. */
    driver: d.varchar({ length: 32 }).notNull().default("mock"),
    handle: d.varchar({ length: 256 }),
    region: d.varchar({ length: 32 }),
    ports: d.jsonb().$type<MachinePort[]>().notNull().default([]),
    createdByUserId: d.varchar({ length: 64 }).references(() => users.id),
    /** Which device provisioned it — provenance, same rationale as sourceVersions. */
    createdByDeviceId: d.varchar({ length: 64 }),
    createdAt: createdAt(),
    lastSeenAt: d.timestamp({ withTimezone: true }),
    suspendedAt: d.timestamp({ withTimezone: true }),
    terminatedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    uniqueIndex("machine_slug_idx").on(t.workspaceId, t.slug),
    index("machine_workspace_idx").on(t.workspaceId),
  ],
);

/** One row per `exec`. Output is truncated — see MAX_OUTPUT_BYTES in the store. */
export const machineExecs = createTable(
  "machine_exec",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    machineId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    cmd: d.text().notNull(),
    cwd: d.varchar({ length: 512 }),
    exitCode: d.integer(),
    stdout: d.text(),
    stderr: d.text(),
    durationMs: d.integer(),
    ranByUserId: d.varchar({ length: 64 }).references(() => users.id),
    ranByDeviceId: d.varchar({ length: 64 }),
    createdAt: createdAt(),
  }),
  (t) => [index("machine_exec_machine_idx").on(t.machineId, t.createdAt)],
);

export const runs = createTable(
  "run",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    /** Frozen version executed — full traceability. */
    specialistVersionId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialistVersions.id),
    threadId: d.varchar({ length: 64 }).references(() => threads.id, {
      onDelete: "set null",
    }),
    runtimeId: d.varchar({ length: 64 }).references(() => runtimes.id),
    /** Source versions visible to this run: [{sourceId, sourceVersionId}]. */
    sourceSnapshot: d.jsonb().$type<Record<string, string>[]>(),
    status: d
      .varchar({ length: 16 })
      .$type<RunStatus>()
      .notNull()
      .default("queued"),
    input: d.jsonb().$type<Record<string, unknown>>().notNull(),
    output: d.jsonb().$type<Record<string, unknown>>(),
    error: d.text(),
    /** Deduplicates API retries. */
    idempotencyKey: d.varchar({ length: 128 }),
    startedByUserId: d.varchar({ length: 64 }).references(() => users.id),
    /** Service key that started the run, when invoked via API. */
    serviceKeyId: d.varchar({ length: 64 }),
    createdAt: createdAt(),
    startedAt: d.timestamp({ withTimezone: true }),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("run_specialist_idx").on(t.specialistId, t.createdAt),
    index("run_status_idx").on(t.status),
    uniqueIndex("run_idempotency_idx").on(t.specialistId, t.idempotencyKey),
  ],
);

export const runEvents = createTable(
  "run_event",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    runId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: d.integer().notNull(),
    kind: d.varchar({ length: 32 }).notNull(),
    payload: d.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  }),
  (t) => [uniqueIndex("run_event_seq_idx").on(t.runId, t.seq)],
);

export const artifacts = createTable(
  "artifact",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    runId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 256 }).notNull(),
    contentType: d.varchar({ length: 128 }).notNull().default("text/plain"),
    /** Inline for small artifacts; storageKey for object storage. */
    content: d.text(),
    storageKey: d.varchar({ length: 512 }),
    bytes: d.integer().notNull().default(0),
    createdAt: createdAt(),
  }),
  (t) => [index("artifact_run_idx").on(t.runId)],
);

/* ------------------------------------------------------------------ */
/* Deployments & service keys                                          */
/* ------------------------------------------------------------------ */

export type DeploymentStatus = "active" | "deprecated";

export const deployments = createTable(
  "deployment",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    specialistVersionId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialistVersions.id),
    /** Evaluation run that gated this deployment. */
    evaluationRunId: d.varchar({ length: 64 }),
    status: d
      .varchar({ length: 16 })
      .$type<DeploymentStatus>()
      .notNull()
      .default("active"),
    deployedByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    deprecatedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("deployment_specialist_idx").on(t.specialistId)],
);

export type ServiceKeyScope =
  | "specialist:invoke"
  | "specialist:read"
  | "runs:read"
  | "artifacts:read"
  | "events:subscribe";

/** Scoped API keys (`atlas_sk_…`). Hash-only at rest; plaintext shown once. */
export const serviceKeys = createTable(
  "service_key",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    groupId: d.varchar({ length: 64 }).references(() => groups.id, {
      onDelete: "cascade",
    }),
    /** Personal-workspace keys bind to a user instead. */
    userId: d.varchar({ length: 64 }).references(() => users.id, {
      onDelete: "cascade",
    }),
    specialistId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => specialists.id, { onDelete: "cascade" }),
    label: d.varchar({ length: 128 }).notNull(),
    keyHash: d.varchar({ length: 64 }).notNull(),
    keyPrefix: d.varchar({ length: 16 }).notNull(),
    scopes: d.jsonb().$type<ServiceKeyScope[]>().notNull(),
    /** Requests per minute. */
    rateLimit: d.integer().notNull().default(60),
    expiresAt: d.timestamp({ withTimezone: true }),
    createdByUserId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id),
    lastUsedAt: d.timestamp({ withTimezone: true }),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [
    uniqueIndex("service_key_hash_idx").on(t.keyHash),
    index("service_key_specialist_idx").on(t.specialistId),
  ],
);

export const apiInvocations = createTable(
  "api_invocation",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    serviceKeyId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => serviceKeys.id, { onDelete: "cascade" }),
    runId: d.varchar({ length: 64 }),
    endpoint: d.varchar({ length: 128 }).notNull(),
    statusCode: d.integer().notNull(),
    createdAt: createdAt(),
  }),
  (t) => [index("api_invocation_key_idx").on(t.serviceKeyId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Pings (the baton: agent -> human -> agent)                          */
/* ------------------------------------------------------------------ */

export type PingStatus = "pending" | "answered" | "expired" | "cancelled";
export type PingChannel = "email" | "sms" | "link";

/**
 * A question an agent (or anyone) asked the workspace owner, and their reply.
 *
 * This is an append-only conversation log scoped to a machine: the agent writes
 * a question, the human answers from wherever they are, and the whole thread
 * stays readable so a later agent can catch up on decisions it did not witness.
 */
export const pings = createTable(
  "ping",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    machineId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    /** Denormalised so the log survives a machine being torn down. */
    workspaceId: d.varchar({ length: 64 }).notNull(),
    question: d.text().notNull(),
    /** Free-form label so an agent can group related pings. */
    context: d.varchar({ length: 256 }),
    status: d
      .varchar({ length: 16 })
      .$type<PingStatus>()
      .notNull()
      .default("pending"),
    answer: d.text(),
    channel: d.varchar({ length: 16 }).$type<PingChannel>().notNull(),
    /**
     * sha256 of the single-use reply token. The raw token only ever exists in
     * the notification link — never at rest, same rule as CLI tokens.
     */
    replyTokenHash: d.varchar({ length: 64 }).notNull(),
    /** Who asked. */
    askedByUserId: d.varchar({ length: 64 }).references(() => users.id),
    askedByDeviceId: d.varchar({ length: 64 }),
    /** Who answered — may differ from who was asked in a shared workspace. */
    answeredByUserId: d.varchar({ length: 64 }),
    notifiedAt: d.timestamp({ withTimezone: true }),
    notifyError: d.varchar({ length: 512 }),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    answeredAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [
    uniqueIndex("ping_reply_token_idx").on(t.replyTokenHash),
    index("ping_machine_idx").on(t.machineId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

/** Append-only. Never updated or deleted by application code. */
export const auditEvents = createTable(
  "audit_event",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    groupId: d.varchar({ length: 64 }),
    userId: d.varchar({ length: 64 }),
    serviceKeyId: d.varchar({ length: 64 }),
    /** Which device acted. Not an FK — audit rows outlive everything. */
    deviceId: d.varchar({ length: 64 }),
    action: d.varchar({ length: 64 }).notNull(),
    /** Entity acted on: {type, id} plus action-specific detail. */
    detail: d.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  }),
  (t) => [
    index("audit_group_idx").on(t.groupId, t.createdAt),
    index("audit_action_idx").on(t.action),
  ],
);

/* ------------------------------------------------------------------ */
/* Device auth (CLI login)                                             */
/* ------------------------------------------------------------------ */

/**
 * RFC 8628-style device codes. Raw device code never stored — sha256 only.
 * The CLI token is minted at first approved poll and returned once.
 */
export const deviceCodes = createTable(
  "device_code",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    userCode: d.varchar({ length: 16 }).notNull(),
    deviceCodeHash: d.varchar({ length: 64 }).notNull(),
    approvedUserId: d.varchar({ length: 64 }),
    mintedTokenId: d.varchar({ length: 64 }),
    /** Client hints captured at flow start, applied when the token is minted. */
    installationId: d.varchar({ length: 128 }),
    deviceKind: d.varchar({ length: 16 }).$type<DeviceKind>(),
    deviceLabel: d.varchar({ length: 128 }),
    devicePlatform: d.varchar({ length: 64 }),
    deviceAppVersion: d.varchar({ length: 32 }),
    consumedAt: d.timestamp({ withTimezone: true }),
    deniedAt: d.timestamp({ withTimezone: true }),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  }),
  (t) => [
    uniqueIndex("device_code_hash_idx").on(t.deviceCodeHash),
    uniqueIndex("device_code_user_idx").on(t.userCode),
  ],
);

export type DeviceKind =
  | "cli"
  | "browser"
  | "web"
  | "ios"
  | "android"
  | "desktop";

/**
 * A client the user signs in from — laptop, phone, Atlas Browser, CLI.
 *
 * NOT a `machine` (that is a remote VM Atlas runs code on). A device never runs
 * Atlas workloads; it only acts on Atlas.
 *
 * `id` is minted server-side at token issuance and is the only value ever
 * written to the audit trail. `installationId` is client-supplied and is a
 * continuity hint ONLY — it is matched scoped to `userId`, so forging one can
 * merge into a device you already own but can never attribute an action to
 * another user's device.
 */
export const devices = createTable(
  "device",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    userId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Client-supplied stable install id. A hint for continuity, never authority. */
    installationId: d.varchar({ length: 128 }),
    kind: d.varchar({ length: 16 }).$type<DeviceKind>().notNull(),
    /** User-visible and user-editable. */
    label: d.varchar({ length: 128 }).notNull(),
    /** Coarse only — "macOS 27", "iOS 19". Never a fingerprint. */
    platform: d.varchar({ length: 64 }),
    appVersion: d.varchar({ length: 32 }),
    lastSeenAt: d.timestamp({ withTimezone: true }),
    /** Revoked devices are never deleted — audit rows reference them. */
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [
    index("device_user_idx").on(t.userId),
    uniqueIndex("device_installation_idx").on(t.userId, t.installationId),
  ],
);

/** CLI access tokens (`atlas_pat_…`). Hash-only at rest. */
export const cliTokens = createTable(
  "cli_token",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
    userId: d
      .varchar({ length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: d.varchar({ length: 64 }).notNull(),
    tokenPrefix: d.varchar({ length: 16 }).notNull(),
    /** The device this token was minted for. Null for tokens predating devices. */
    deviceId: d.varchar({ length: 64 }).references(() => devices.id, {
      onDelete: "set null",
    }),
    label: d.varchar({ length: 128 }).notNull().default("Atlas CLI"),
    lastUsedAt: d.timestamp({ withTimezone: true }),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  }),
  (t) => [
    uniqueIndex("cli_token_hash_idx").on(t.tokenHash),
    index("cli_token_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations (query helpers only)                                      */
/* ------------------------------------------------------------------ */

export const groupsRelations = relations(groups, ({ many }) => ({
  memberships: many(memberships),
  workspaces: many(workspaces),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  group: one(groups, {
    fields: [memberships.groupId],
    references: [groups.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  group: one(groups, {
    fields: [workspaces.groupId],
    references: [groups.id],
  }),
  specialists: many(specialists),
}));

export const specialistsRelations = relations(specialists, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [specialists.workspaceId],
    references: [workspaces.id],
  }),
  versions: many(specialistVersions),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, {
    fields: [messages.threadId],
    references: [threads.id],
  }),
  author: one(users, {
    fields: [messages.authorUserId],
    references: [users.id],
  }),
}));

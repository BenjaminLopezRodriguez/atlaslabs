# Atlas VM layer — Design

**Date:** 2026-07-26
**Status:** Naming decision RESOLVED 2026-07-26 — `machines` table, scoped to tenancy `workspaces`. Device track in progress.
**Repo:** atlaslabs
**Consumers:** `@atlaslabs/cli`, the `atlas` agent skill, Atlas Browser

## Goal

Give Atlas a **persistent VM primitive** so that:

1. `atlas` (the CLI) can create, drive, and tear down remote dev machines.
2. An `atlas` agent skill can offload build/run/test work to those machines and
   page the user instead of stalling in chat.
3. Atlas Browser can attach a workspace to a running VM — terminal, files,
   ports, preview.

This is the port of the minimachines model into Atlas. It is **not** a rewrite:
atlaslabs already has device-code auth, API keys, a `/api/v1/cli/*` surface, and
the same stack (Next.js App Router, WorkOS, Drizzle, tRPC). What is missing is
the machine itself.

v1 ships a **stable API contract with mocked runners**, matching how
minimachines shipped. Real provisioning replaces the mock behind the same
shapes.

## Non-goals (v1)

- Real container/microVM provisioning (mocked runners; real driver is the
  immediate follow-up)
- Shareable port links / subdomain proxy (separate effort, see minimachines
  `2026-07-24-shareable-port-links.md`)
- The baton / pager loop (separate effort; the `notify` endpoint is stubbed out
  in the schema here but not built)
- Atlas Browser's socket transport — this plan gives it a REST surface to build
  against, nothing more
- Billing/metering on exec minutes
- Non-TypeScript SDKs

---

## ✅ RESOLVED: two things are called "workspace"

**Decision (2026-07-26): new `machines` table scoped to the existing tenancy
`workspaces`.** The rename alternative was rejected. Recorded here because every
table and route below depends on it.

| Name | What it is today | Where |
|------|------------------|-------|
| `workspaces` (existing) | **Tenancy container.** `(id, name, userId, groupId)`. Owns specialists, sources, threads. One personal per user, one per group. | `src/server/db/schema.ts:103` |
| "workspace" (Atlas Browser) | **A project and its VM.** Has a slug, a terminal, files, ports, a preview. `atlas://workspace/my-app`. | `Atlas_Browser_Spec.md` |

These are different primitives that collided on a word. Overloading the existing
table would put a VM handle on the thing that owns your whole org's specialists,
which is wrong.

**Proposed resolution — new `machines` table, scoped to a tenancy workspace:**

```
workspaces (tenancy)  1 ─── n  machines (slug + VM)
```

- Internally and in the REST API the primitive is a **machine** — consistent
  with the existing `runtimes` sibling and with the minimachines heritage.
- Atlas Browser's user-facing "workspace" **is** one machine. `atlas://workspace/my-app`
  resolves to the machine with `slug = "my-app"`.
- Slugs are unique per tenancy workspace, not globally.

The alternative — renaming the existing `workspaces` table to `orgs`/`scopes` and
giving the browser's concept the `workspaces` name — is cleaner in the long run
but touches ~30 files and every existing route. Not worth it unless you want the
product language to match the schema exactly.

**This is the chosen design.**

---

---

## Device identity and attribution

**Independent of the VM layer** — it depends on nothing below and can ship
before or after. Grouped here because it is the second half of "what is the
identity of the thing acting on Atlas".

Every client — Mac, PC, iPhone, Android, Atlas Browser, CLI — gets a stable
device id at sign-in, and that id is attributed to edits, uploads, and agent
interactions.

### ⚠️ Naming: a device is not a machine

We already have one collision (workspace/workspace). Do not make a second.

| Term | Meaning |
|------|---------|
| **machine** | A remote VM Atlas provisions and runs code on. `machines` table. |
| **device** | A client the user signs in from. `devices` table. Never runs Atlas workloads. |

The user's laptop is a **device**. The VM it drives is a **machine**. Reviewers
should reject any PR that puts one word where the other belongs.

### The trust split — this is the part that matters

The obvious implementation is "client generates a UUID and sends it up". That
must not be the authoritative id: **any holder of a token could then claim any
device id**, and the audit trail becomes worthless at exactly the moment you
need it — an incident review. Attribution you cannot trust is worse than no
attribution, because it reads as evidence.

Split it in two:

| Field | Who generates | Trust | Purpose |
|-------|---------------|-------|---------|
| `devices.id` | **Server**, at token issuance | Authoritative | What gets written to the audit trail |
| `installationId` | Client, once at install, stored locally | Hint only | Lets the *same* physical device keep one identity across re-logins |

At device-code start the client may send `installation_id`. When a token is
minted, the server looks for an existing device with that `installationId`
**scoped to the authenticating user**. Match → reuse that device row. No match →
mint a new one. Forging an `installationId` therefore only lets an attacker
merge into a device record they already own; it cannot attribute an action to
another user's device. The forgeable field is harmless by construction.

Every request already does a token-hash lookup in `cliUserFromRequest`. The
device id comes back from that same lookup — no extra round trip, no extra
client trust.

### Schema

```ts
export const devices = createTable("device", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
  userId: d.varchar({ length: 64 }).notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Client-supplied stable install id. A hint for continuity, never authority. */
  installationId: d.varchar({ length: 128 }),
  /** "cli" | "browser" | "web" | "ios" | "android" | "desktop" */
  kind: d.varchar({ length: 16 }).notNull(),
  /** User-visible, user-editable. "Benji's MacBook Pro" */
  label: d.varchar({ length: 128 }).notNull(),
  /** Coarse only — "macOS 27", "iOS 19". Never a fingerprint. */
  platform: d.varchar({ length: 64 }),
  appVersion: d.varchar({ length: 32 }),
  lastSeenAt: d.timestamp({ withTimezone: true }),
  revokedAt: d.timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}), (t) => [
  index("device_user_idx").on(t.userId),
  uniqueIndex("device_installation_idx").on(t.userId, t.installationId),
]);
```

Then two small changes to existing tables:

- `cliTokens.deviceId` → FK to `devices`. One token belongs to one device.
- `auditEvents.deviceId` → nullable varchar, alongside the existing `userId` /
  `serviceKeyId`.

### Why this is a small diff

`src/server/audit.ts` is a single helper already called from ~10 places —
sources sync (uploads), specialist invoke (agent interactions), runs,
deployments, groups, evaluations. Adding one optional `deviceId` field to
`audit()` and threading it from the request context covers the whole surface the
feature asks for. **Do not add `deviceId` columns across a dozen domain tables.**
The audit trail is the attribution surface; only add a `createdByDeviceId`
column where provenance is intrinsic to the row rather than an event about it —
`sourceVersions` is the one clear candidate, because "which device uploaded this
source" is a property of the artifact, not of a moment.

### Web and mobile sessions

The CLI and Atlas Browser carry `atlas_pat_` tokens, so device id rides the
token. Web and mobile sign in through WorkOS and carry a session cookie
instead — they need a parallel path: mint the device at sign-in callback, store
its id in a **signed, httpOnly** cookie, and resolve it the same way server-side.

Do not reuse one device row across the CLI and the web session on the same
laptop. They are separately revocable credentials, and collapsing them means
revoking one silently kills the other.

### Revocation is the user-facing half

A device list is only worth building if you can act on it. `POST /api/v1/devices/:id/revoke`
sets `revokedAt` and revokes that device's tokens — that is "sign out my stolen
iPhone", which is the feature users actually want from this. Revoked devices
stay in the table forever: deleting them would rewrite history in the audit
trail that referenced them.

### Privacy

Store coarse platform strings only. **No IP addresses, no hardware
identifiers, no fingerprinting.** Device labels are user-visible and
user-editable, and the device list is surfaced in account settings so nothing is
collected that the user cannot see. `lastSeenAt` updates are best-effort — the
existing `cliTokens.lastUsedAt` write already establishes that pattern.

### Testing

- Same `installationId` + same user, re-login → same `devices.id`
- Same `installationId` + **different** user → different device row (no cross-user merge)
- Absent `installationId` → new device each login, still attributed correctly
- Revoked device → its tokens 401
- `audit()` records `deviceId` when the request has one, and still records when it does not
- Audit rows survive device revocation

---

## Decisions locked

| Topic | Choice |
|-------|--------|
| Package | Keep `@atlaslabs/cli`, bin stays `atlas`. `atlas-cli` and `atlas` are both taken on npm; `@atlaslabs/cli` already gives `atlas login`. |
| Auth | Reuse existing `atlas_pat_` / `atlas_sk_` Bearer tokens and `cliUserFromRequest`. No new auth. |
| Transport | REST `/api/v1/machines/**`, same `requireCli` / `toHttpError` helpers as `/api/v1/cli/*`. |
| Runners | Mocked in v1. `MachineDriver` interface so a real driver drops in unchanged. |
| Persistence | Postgres via Drizzle, `atlas_` table prefix (existing `createTable`). Not a JSON file — atlaslabs is already on Postgres. |
| Slug rules | `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$` — a DNS label, because slugs become preview hostnames. Same regex Atlas Browser already enforces. |
| Ports | Recorded on the machine at create time. Exposing them publicly is the separate shares effort. |

---

## Schema (Drizzle, `src/server/db/schema.ts`)

```ts
export type MachineStatus =
  | "provisioning" | "running" | "suspended" | "stopping" | "stopped" | "error";

export const machines = createTable("machine", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
  workspaceId: d.varchar({ length: 64 })
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** DNS-label slug, unique within the tenancy workspace. atlas://workspace/<slug> */
  slug: d.varchar({ length: 63 }).notNull(),
  name: d.varchar({ length: 256 }),
  templateId: d.varchar({ length: 64 }),
  status: d.varchar({ length: 16 }).$type<MachineStatus>().notNull().default("provisioning"),
  /** Driver kind + opaque handle. `mock` today; `modal`/`fly`/`k8s` later. */
  driver: d.varchar({ length: 32 }).notNull().default("mock"),
  handle: d.varchar({ length: 256 }),
  region: d.varchar({ length: 32 }),
  /** Port -> { label, internalUrl }. Public exposure is the shares effort. */
  ports: d.jsonb().$type<MachinePort[]>().notNull().default([]),
  createdBy: d.varchar({ length: 64 }).references(() => users.id),
  createdAt: createdAt(),
  lastSeenAt: d.timestamp({ withTimezone: true }),
  suspendedAt: d.timestamp({ withTimezone: true }),
  terminatedAt: d.timestamp({ withTimezone: true }),
}), (t) => [
  uniqueIndex("machine_slug_idx").on(t.workspaceId, t.slug),
  index("machine_workspace_idx").on(t.workspaceId),
]);

export const machineExecs = createTable("machine_exec", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey().$defaultFn(id),
  machineId: d.varchar({ length: 64 }).notNull()
    .references(() => machines.id, { onDelete: "cascade" }),
  cmd: d.text().notNull(),
  cwd: d.varchar({ length: 512 }),
  exitCode: d.integer(),
  stdout: d.text(),
  stderr: d.text(),
  durationMs: d.integer(),
  createdAt: createdAt(),
}));
```

`machineFiles` is deliberately **not** a table in v1 — the mock driver keeps a
tree in memory/disk, and a real driver will write to the VM filesystem. Nothing
should persist file bytes in Postgres.

### Lifecycle

```
provisioning → running ⇄ suspended → stopping → stopped
```

Machines suspend on idle. Reattach restores the filesystem; it does **not**
restore running processes. Both the CLI and the browser must say so plainly
rather than implying processes survived — the spec calls this out and it is a
data-loss-adjacent honesty issue, not a cosmetic one.

---

## Driver interface

```ts
// src/server/machines/driver.ts
export interface MachineDriver {
  create(input: { templateId?: string; region?: string }): Promise<{ handle: string; ports: MachinePort[] }>;
  stop(handle: string): Promise<void>;
  suspend(handle: string): Promise<void>;
  resume(handle: string): Promise<void>;
  exec(handle: string, input: ExecInput): Promise<ExecResult>;
  putFile(handle: string, path: string, body: Uint8Array): Promise<void>;
  getFile(handle: string, path: string): Promise<Uint8Array | null>;
}
```

`MockDriver` is the only implementation in v1: deterministic `exec` output that
echoes the command, an in-memory file tree keyed by handle, ports assigned from
the template. The registry is a plain `Record<string, MachineDriver>` keyed by
`machine.driver` — no factory, no DI container.

---

## REST API

All under `/api/v1/machines`, all requiring `Authorization: Bearer atlas_pat_…`,
all reusing `requireCli` / `unauthorized` / `toHttpError` from
`src/app/api/v1/cli/helpers.ts`. Error shape matches the existing CLI surface:
`{ error: string }` with 400/401/403/404/409/500.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/machines` | Create `{ workspaceId?, slug, templateId?, name? }` |
| GET | `/api/v1/machines` | List caller's machines (optionally `?workspaceId=`) |
| GET | `/api/v1/machines/:id` | Get one (owner-checked) |
| GET | `/api/v1/machines/by-slug/:slug` | Resolve a slug — what Atlas Browser calls |
| POST | `/api/v1/machines/:id/stop` | Stop / teardown |
| POST | `/api/v1/machines/:id/suspend` | Suspend |
| POST | `/api/v1/machines/:id/resume` | Resume |
| POST | `/api/v1/machines/:id/exec` | `{ cmd, cwd?, env? }` → `{ exitCode, stdout, stderr, durationMs }` |
| PUT | `/api/v1/machines/:id/files/*path` | Upload |
| GET | `/api/v1/machines/:id/files/*path` | Download |
| GET | `/api/v1/machines/:id/ports` | Listening ports + labels |

Ownership: a machine is reachable if the caller owns its tenancy workspace, or
is a member of the group that owns it. Reuse `getPersonalWorkspace` and the
`memberships` lookup already used by `/api/v1/cli/workspaces`.

**Machine creation must be idempotent on `(workspaceId, slug)`** — return `409`
on a duplicate rather than silently provisioning a second VM. Atlas Browser
retries deep links, and a retry that spawns a second billed VM is the expensive
kind of bug.

---

## CLI surface (`packages/cli`)

New commands alongside the existing `login/whoami/group/init/source/specialist/open/logs/wait/api-key`:

```
atlas machine create <slug> [--template <id>] [--workspace <id>]
atlas machine ls
atlas machine rm <slug>
atlas machine status <slug>

atlas exec <slug> -- <cmd...>
atlas put <slug> <local> <remote>
atlas get <slug> <remote> <local>
atlas ports <slug>

atlas open <slug>            # existing command, extended to emit atlas://workspace/<slug>
```

Constraints inherited from the existing CLI: **zero runtime dependencies except
`yaml`**, token from keychain (`id.atlaslabs.cli`) with a `0600` file fallback,
config under `$XDG_CONFIG_HOME/atlas`. New commands must not add dependencies.

Deferred to their own efforts: `atlas ssh`, `atlas snapshot`, `atlas deploy`,
`atlas share`, and the baton (`atlas ask` / `atlas say`).

---

## How Atlas Browser consumes this

Out of scope to build here, but the contract has to fit:

- `atlas://workspace/<slug>` → `GET /api/v1/machines/by-slug/:slug`
- The Files pane and Terminal pane need **streaming**, which REST does not give
  them. `ARCHITECTURE.md` §4 specifies one multiplexed WebSocket per workspace
  (`ch:term`, `ch:fs`, `ch:proc`). This plan deliberately ships REST only —
  the browser can render workspace state, list ports, and run one-shot `exec`
  against it, which is enough to build the pane UI against real data before the
  socket exists.
- The browser holds `atlas_pat_` tokens in the **main process only**
  (`safeStorage`), never in a renderer.

---

## Testing

- Unit: slug validation (valid DNS labels, rejects `..`, uppercase, 64 chars)
- Unit: create is idempotent per `(workspaceId, slug)`; second create → 409
- Unit: ownership — user A cannot read/exec/stop user B's machine (404, not 403,
  so machine existence does not leak)
- Unit: mock driver exec/file round-trip and status transitions
- Unit: lifecycle guards — exec on a `stopped` machine → 409
- CLI: `atlas machine create/ls/rm` against a mocked fetch
- Manual: `atlas login` → `atlas machine create demo` → `atlas exec demo -- echo hi`

Follow the repo's existing `pnpm test` runner.

## Success criteria

- `atlas machine create demo && atlas exec demo -- echo hi` works end to end
  against a local dev server with a real `atlas_pat_` token.
- `GET /api/v1/machines/by-slug/demo` returns enough for Atlas Browser to render
  a workspace header, status, and port list.
- Swapping `MockDriver` for a real driver requires no route or CLI changes.

## Out-of-scope follow-ups

1. Real provisioner (Modal / Fly / k8s) behind `MachineDriver`
2. The baton — `notify` endpoint + `atlas ask` / `atlas say` + phone delivery
3. Shareable port links + subdomain proxy
4. Atlas Browser's multiplexed WebSocket (`ARCHITECTURE.md` §4)
5. The `atlas` agent skill (needs the CLI commands above to exist first)
6. Snapshots and `atlas deploy`

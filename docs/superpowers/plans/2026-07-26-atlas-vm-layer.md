# Atlas VM layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent machine (VM) primitive to atlaslabs — schema, driver interface with a mock implementation, `/api/v1/machines/**` REST surface, and `atlas machine|exec|put|get|ports` CLI commands — so the `atlas` skill and Atlas Browser have something real to drive.

**Architecture:** Drizzle `machines` + `machineExecs` tables scoped to the existing tenancy `workspaces`. A `MachineDriver` interface with a single `MockDriver` in v1. Next.js App Router handlers under `/api/v1/machines` reusing the existing `requireCli` / `toHttpError` helpers. CLI commands added to the existing zero-dependency `packages/cli`.

**Tech Stack:** Next.js 15 App Router, Drizzle + Postgres, Zod, WorkOS (existing auth), `node:test`, pnpm workspace.

**Naming decision:** RESOLVED 2026-07-26 — new `machines` table scoped to the existing tenancy `workspaces`. Tasks 1–6 are unblocked.

**Status:** COMPLETE except the devices settings UI (D4 step 3). Real Modal provisioner shipped on top (see below). Tasks 1–6 and D1–D5 all implemented and verified. 34 app tests + 4 CLI tests passing; end-to-end verified against a live dev server.

## Global Constraints

- Package stays `@atlaslabs/cli`, bin stays `atlas`
- Auth is existing `atlas_pat_` / `atlas_sk_` Bearer tokens — do not invent a new scheme
- Table prefix via existing `createTable` helper (`atlas_machine`, `atlas_machine_exec`)
- **`packages/cli` has zero runtime dependencies except `yaml`** — new commands must not add any
- Runners mocked; real driver drops in behind `MachineDriver` unchanged
- Error shape matches the existing CLI surface: `{ error: string }`
- Do not commit unless the user asks (repo rule)
- Slug regex is the same one Atlas Browser enforces: `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/server/db/schema.ts` | `machines`, `machineExecs` tables + status types |
| `src/server/machines/slug.ts` | Slug validation, shared by API and CLI |
| `src/server/machines/slug.test.ts` | Slug rules incl. traversal/length rejection |
| `src/server/machines/driver.ts` | `MachineDriver` interface + registry |
| `src/server/machines/mock-driver.ts` | v1 implementation |
| `src/server/machines/store.ts` | create/list/get/getBySlug/stop/suspend/resume/exec/files |
| `src/server/machines/store.test.ts` | Ownership, idempotency, lifecycle guards |
| `src/server/machines/authz.ts` | Machine reachability from tenancy workspace + memberships |
| `src/app/api/v1/machines/route.ts` | `POST` create, `GET` list |
| `src/app/api/v1/machines/[id]/route.ts` | `GET` one |
| `src/app/api/v1/machines/by-slug/[slug]/route.ts` | Slug resolution for Atlas Browser |
| `src/app/api/v1/machines/[id]/stop/route.ts` | Stop |
| `src/app/api/v1/machines/[id]/suspend/route.ts` | Suspend |
| `src/app/api/v1/machines/[id]/resume/route.ts` | Resume |
| `src/app/api/v1/machines/[id]/exec/route.ts` | Exec |
| `src/app/api/v1/machines/[id]/files/[...path]/route.ts` | `PUT` / `GET` files |
| `src/app/api/v1/machines/[id]/ports/route.ts` | Port list |
| `packages/cli/src/cli.ts` | `machine`, `exec`, `put`, `get`, `ports` commands |
| `packages/cli/src/cli.test.ts` | Command routing + arg parsing |
| `drizzle/**` | Generated migration |

---

### Task 1: Schema + slug rules

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/machines/slug.ts`, `src/server/machines/slug.test.ts`

**Interfaces:**
- Produces: `machines`, `machineExecs`, `MachineStatus`, `MachinePort`
- Produces: `isValidSlug(s: string): boolean`, `assertSlug(s: string): string`

- [x] **Step 1: Write failing slug tests** — valid: `my-app`, `a`, 63 chars. Invalid: empty, 64 chars, `My-App`, `-lead`, `trail-`, `..`, `../../etc/passwd`, `a_b`, non-string.
- [x] **Step 2: Implement `slug.ts`** — one regex, no dependencies. This file is imported by the CLI too, so keep it free of server-only imports.
- [x] **Step 3: Add tables to `schema.ts`** per the design doc, including the `uniqueIndex` on `(workspaceId, slug)`.
- [x] **Step 4: `pnpm db:generate`** and review the generated migration by hand before applying.
- [x] **Step 5: Run tests** — `pnpm test`

---

### Task 2: Driver interface + mock

**Files:**
- Create: `src/server/machines/driver.ts`, `src/server/machines/mock-driver.ts`

**Interfaces:**
- Produces: `MachineDriver`, `getDriver(kind: string): MachineDriver`
- Consumes: nothing (deliberately standalone and testable)

- [x] **Step 1: Define `MachineDriver`** exactly as in the design doc. No extra methods — every speculative one is a method a real driver has to fake.
- [x] **Step 2: Implement `MockDriver`** — deterministic `exec` echoing the command, in-memory file tree keyed by handle, ports from the template.
- [x] **Step 3: Registry** — a plain `Record<string, MachineDriver>`. No factory class.

---

### Task 3: Machine store + authz

**Files:**
- Create: `src/server/machines/authz.ts`, `src/server/machines/store.ts`, `src/server/machines/store.test.ts`

**Interfaces:**
- Produces: `createMachine`, `listMachines`, `getMachine`, `getMachineBySlug`, `stopMachine`, `suspendMachine`, `resumeMachine`, `execOnMachine`, `putMachineFile`, `getMachineFile`
- Produces: `reachableMachine(db, userId, machineId)` → machine or null
- Consumes: Task 1 schema, Task 2 driver, existing `getPersonalWorkspace` + `memberships`

- [x] **Step 1: Write failing tests**
  - create is idempotent per `(workspaceId, slug)` — second create throws a conflict
  - user A cannot get/exec/stop user B's machine
  - a group member **can** reach a group workspace's machine
  - exec on a `stopped` machine is rejected
  - resume on a `suspended` machine restores `running`
  - exec records a `machineExecs` row
- [x] **Step 2: Implement `authz.ts`** — reuse the personal-workspace + memberships pattern from `src/app/api/v1/cli/workspaces/route.ts`. Do not write a second ownership model.
- [x] **Step 3: Implement `store.ts`.** Not-found and not-owned both return null so callers emit `404` either way — machine existence must not leak across tenants.
- [x] **Step 4: Run tests**

---

### Task 4: REST routes

**Files:**
- Create: all `src/app/api/v1/machines/**/route.ts` from the file map

**Interfaces:**
- Consumes: Task 3 store, existing `requireCli` / `unauthorized` / `toHttpError`

- [x] **Step 1: `POST` + `GET /api/v1/machines`.** Validate the body with Zod. Default `workspaceId` to the caller's personal workspace when omitted.
- [x] **Step 2: `GET /:id` and `GET /by-slug/:slug`.**
- [x] **Step 3: Lifecycle routes** — stop, suspend, resume.
- [x] **Step 4: `POST /:id/exec`.** Cap `stdout`/`stderr` stored per exec (truncate with a marker) — an unbounded command output written straight to Postgres is a denial-of-service on your own database.
- [x] **Step 5: Files routes.** Reject absolute paths and any `..` segment before touching the driver. Cap upload size.
- [x] **Step 6: `GET /:id/ports`.**
- [x] **Step 7: Confirm `src/middleware.ts` lets `/api/v1/machines` through** without cookie auth, the same way `/api/v1/cli` is handled.
- [x] **Step 8: Route tests** — auth required, ownership enforced, 409 on duplicate slug.

---

### Task 5: CLI commands

**Files:**
- Modify: `packages/cli/src/cli.ts`, `packages/cli/src/cli.test.ts`

**Interfaces:**
- Consumes: Task 4 routes, existing token/config helpers in `cli.ts`

- [x] **Step 1: Write failing tests** for command routing and arg parsing (`atlas exec demo -- echo hi` must pass `echo hi` through intact, including flags after `--`).
- [x] **Step 2: Add `machine create|ls|rm|status`** to the existing `switch`, reusing the established request helper and error printing.
- [x] **Step 3: Add `exec`, `put`, `get`, `ports`.** Exit with the remote command's exit code from `exec` — a wrapper that always exits 0 breaks every script that uses it.
- [x] **Step 4: Extend `open`** to emit `atlas://workspace/<slug>` so Atlas Browser can be launched from the terminal.
- [x] **Step 5: Verify no new dependencies** — `packages/cli` must still install with only `yaml`.
- [x] **Step 6: Run tests**

---

### Task 6: Manual verification

- [x] `pnpm dev`, then `atlas login` against localhost
- [x] `atlas machine create demo` → row in Postgres, status `running`
- [x] `atlas machine create demo` again → clean 409, no second row
- [x] `atlas exec demo -- echo hi` → echoes, exit code propagates
- [x] `atlas put demo ./x.txt /tmp/x.txt && atlas get demo /tmp/x.txt -` → round-trips
- [x] `atlas ports demo`, `atlas machine ls`, `atlas machine rm demo`
- [x] `curl -H "Authorization: Bearer atlas_pat_…" localhost:3000/api/v1/machines/by-slug/demo` returns what Atlas Browser needs
- [x] Second user cannot see or exec the first user's machine

---

## Device identity track (independent — can run before, after, or in parallel)

Depends on nothing in Tasks 1–6. See the "Device identity and attribution"
section of the design doc, especially the trust split.

### Task D1: `devices` schema + resolution

**Files:**
- Modify: `src/server/db/schema.ts` (add `devices`; add `cliTokens.deviceId`, `auditEvents.deviceId`)
- Create: `src/server/devices/store.ts`, `src/server/devices/store.test.ts`

**Interfaces:**
- Produces: `resolveDevice({ userId, installationId?, kind, label?, platform?, appVersion? })` → device
- Produces: `revokeDevice({ userId, deviceId })`, `listDevices(userId)`

- [x] **Step 1: Write failing tests** — same `installationId` + same user re-login returns the SAME device id; same `installationId` + DIFFERENT user returns a different row (this is the security test, do not skip it); absent `installationId` mints a new device; revoked device's tokens 401.
- [x] **Step 2: Add tables**, including `uniqueIndex(userId, installationId)`.
- [x] **Step 3: Implement `resolveDevice`.** The lookup is scoped by `userId` first, always. A query that matches on `installationId` alone is the bug this whole design exists to prevent.
- [x] **Step 4: `pnpm db:generate`**, review the migration by hand.

### Task D2: Mint devices at token issuance

**Files:**
- Modify: `src/app/api/v1/auth/device/code/route.ts` (accept optional `installation_id`, `kind`, `label`, `platform`)
- Modify: `src/app/api/v1/auth/device/token/route.ts` (resolve device, set `cliTokens.deviceId`)
- Modify: `src/server/cli-auth.ts` (`cliUserFromRequest` returns the device id)

- [x] **Step 1: Accept the client hint** at device-code start; persist it on the `deviceCodes` row so it survives to the token mint.
- [x] **Step 2: Resolve + attach the device** when the token is minted.
- [x] **Step 3: Return `deviceId` from `cliUserFromRequest`** — it already does the token-hash lookup, so this is a join, not a new query.
- [x] **Step 4: Reject any code path that reads a device id from a request header or body.** There must be exactly one source of device identity: the token.

### Task D3: Attribution through `audit()`

**Files:**
- Modify: `src/server/audit.ts` (optional `deviceId`)
- Modify: `src/app/api/v1/cli/**` call sites to pass it

- [x] **Step 1: Add `deviceId?: string | null`** to the `audit()` event type and insert.
- [x] **Step 2: Thread it from `requireCli`** at the ~10 existing call sites. Do NOT add `deviceId` columns to domain tables — the audit trail is the attribution surface.
- [x] **Step 3: `sourceVersions.syncedByDeviceId`** (named to match the existing `syncedByUserId`) — the one place provenance belongs on the row rather than on an event.
- [x] **Step 4: Verify** audit rows still write when there is no device (service-key calls have none).

### Task D4: Device list + revocation

**Files:**
- Create: `src/app/api/v1/devices/route.ts`, `src/app/api/v1/devices/[id]/revoke/route.ts`
- Create: account-settings devices panel
- Modify: `packages/cli/src/cli.ts` — `atlas device ls|rm`

- [x] **Step 1: `GET /api/v1/devices`** — caller's devices, never another user's.
- [x] **Step 2: `POST /api/v1/devices/:id/revoke`** — set `revokedAt` and revoke that device's `cliTokens`. Revoked rows are never deleted; audit history references them.
- [ ] **Step 3: Settings UI** — label, kind, platform, last seen, revoke. NOT BUILT: the app has no settings route yet, so this needs a route + nav placement decision in a site under active design. API and CLI cover the capability in the meantime.
- [x] **Step 4: CLI `atlas device ls|rm`.**
- [x] **Step 5: Covered by an automated integration test** instead of a manual pass — `src/server/devices/flow.test.ts` drives code → approve → token → list → revoke against the real route handlers.

### Task D5: Web and mobile sessions — COMPLETE (design changed)

**Decision (2026-07-26): `sid` as the web device's `installationId`.** The plan
originally said "signed httpOnly cookie"; implementation found two problems with
that, and a better option.

**Problem.** AuthKit's `handleAuth({ onSuccess })` hook exists (verified in
`authkit-nextjs@4.3.0`) but it does **not** receive the response object — the
redirect `Response` is constructed before `onSuccess` runs. Setting a cookie via
`next/headers` from there is not reliably merged into a manually constructed
`Response`. Beyond that, a hand-rolled signed cookie means a new signing secret
to manage and rotate, for a value the session already carries.

**Shipped: the WorkOS session id (`sid`) is the web device's
`installationId`.** `withAuth()` already decodes it from the signed access token
(`authkit-nextjs/dist/esm/session.js:149`), so it is server-attested and not
client-forgeable. `getSessionUser()` then calls the same `resolveDevice()` the
CLI path uses, scoped by `userId`, with no new cookie and no new secret.

Accepted trade-off: a new WorkOS session (re-login, or session
expiry) produces a new web device row. That is arguably correct — for the web,
the session *is* the device credential, and it keeps web and CLI separately
revocable as required. If you want one durable row per browser instead, the
cookie approach comes back and needs its own secret.

- [x] **Step 0: Decided** — `sid` as installationId
- [x] **Step 1: Resolve the device in `getSessionUser()`** — `SessionUser` now carries `deviceId`; resolution failure logs and degrades to null rather than breaking the session
- [x] **Step 2: Threaded `deviceId` into the tRPC audit call sites** — 6 sites across `correction.ts`, `group.ts`, `cli.ts`
- [x] **Step 3: Confirmed by test** — `flow.test.ts` "web session and CLI on one laptop are separate devices", including that revoking the browser does not sign out the CLI

---

## Device track: what remains

Only the settings UI (D4 step 3). Everything else in D1–D5 is implemented and
covered by tests. A follow-up worth noting: `resolveDevice` writes `lastSeenAt`
fire-and-forget so `getSessionUser()` stays one awaited read on the hot path —
if last-seen accuracy ever matters more than latency, that is the line to change.

---

## What this plan deliberately leaves out

Each is its own effort, and each is cheaper once the above exists:

1. ~~**Real provisioner** behind `MachineDriver`~~ — DONE 2026-07-26. Modal sandboxes via `modal/atlas_sandboxes.py` (deployed bridge) + `src/server/machines/modal-driver.ts`. Select with `ATLAS_MACHINE_DRIVER=modal`.
2. **The baton** — `notify` endpoint, `atlas ask` / `atlas say`, phone delivery
3. **Shareable port links** + subdomain proxy (port the minimachines share layer)
4. **Atlas Browser's WebSocket** — `ARCHITECTURE.md` §4; REST here is enough to build the pane UI against real data first
5. **The `atlas` agent skill** — port of `~/.claude/skills/minimachine/SKILL.md`, retargeted at these commands. Cannot be written until Task 5 lands, since the skill is mostly a contract about which commands to call.
6. `atlas ssh`, `atlas snapshot`, `atlas deploy`


---

## Modal provisioner (shipped 2026-07-26, beyond the original plan)

| Path | Responsibility |
|------|----------------|
| `modal/atlas_sandboxes.py` | Deployed Modal app. One ASGI FastAPI service wrapping `modal.Sandbox`: `/create /exec /put /get /status /terminate`, bearer-auth'd against the `atlas-bridge` Modal secret. |
| `src/server/machines/modal-driver.ts` | `MachineDriver` implementation calling that bridge. |
| `src/server/machines/registry.ts` | Driver selection. `ATLAS_MACHINE_DRIVER=mock` (default) or `modal`. |

**Why a bridge:** atlaslabs is TypeScript, the Modal client is Python. The bridge
is the seam; route shapes mirror `MachineDriver` one-to-one so nothing above the
driver knows which backend is live.

**Existing machines keep the driver recorded on their row**, so flipping
`ATLAS_MACHINE_DRIVER` never orphans anything already provisioned.

### Capability difference that matters

Modal sandboxes have **no suspend/resume** — stopping one destroys its
filesystem. `MachineDriver.supportsSuspend` exists for this: `suspendMachine()`
refuses with a 409 on backends that cannot suspend, rather than aliasing suspend
to stop and throwing away a user's work while the UI claims it was saved.

### Cost

Sandboxes bill while running. Created with `timeout=1h` and `idle_timeout=5m`
so a forgotten machine cannot bill indefinitely. `atlas machine rm <slug>`
terminates immediately.

### Known gaps

- Ports are fixed at create time (`encrypted_ports` is a Modal create-time
  param), so the shareable port set cannot be widened after provisioning.
- `resume` is unsupported on Modal; the API returns 409.
- Tunnels are public URLs with unguessable hostnames. Gating them is the
  separate shareable-port-links effort.

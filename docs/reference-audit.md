# Reference Audit

Audited: `../manycat`, `../minimachines`, `../afreka` (all read-only) and the
current Atlas target repo (fresh T3 scaffold + landing page).

## 1. Patterns worth reimplementing

### Manycat
- **NextAuth v5** with GitHub/Google providers plus a dev-only Credentials
  escape hatch (`src/auth.ts`) — clean pattern for local dev without OAuth keys.
- **`pgTableCreator` prefix** (`manycat_*`) — Atlas uses `atlas_*`.
- **Chat message rows** as `(scopeId, threadId, seq, jsonb payload)` with a
  scope index — simple, ordered, restorable chat history.
- **Membership + join-token ACL** (`work_session_member`, `work_join_token`) —
  expiring/revocable invite tokens; adapt for group invitations.
- **Status enums as `varchar().$type<union>()`** — no pg enums to migrate.
- **docker-compose** with healthchecked postgres and app depending on it.
- **k8s layout**: base + overlays kustomize, separate deployments per service,
  isolated sandbox Job template.

### Minimachines
- **Device auth flow (RFC 8628 style)** (`device_code` table + CLI
  `loginDevice`): raw device code never stored, sha256 hash only, API key
  minted once at approved poll. Reimplement verbatim in concept for
  `atlas login`.
- **API keys hash-only** (`api_key`: keyHash + keyPrefix + label + revokedAt,
  unique hash index for O(1) verify) — exact model for Atlas service keys,
  plus scopes/group/specialist binding.
- **Single-file CLI** (`packages/cli/src/cli.ts`, ~1.5k lines, one dep) —
  no framework, fetch-based, workspace package. Atlas CLI follows this shape.
- **Jobs table** (`input/artifacts jsonb`, status varchar) — seed for Atlas
  runs.
- **pnpm workspace** with `packages/cli` next to the app.

### Afreka
- **Dataset/provenance rows** (datasets, dataset_requests, crowdsourced_data
  with region/consent fields) — informs Atlas `sources`/`source_versions`
  keeping provenance, owner, scope, version columns from day one.

## 2. Patterns that conflict with the Atlas spec — do not copy

- Manycat single-account ownership (`accountId` on every row): Atlas needs a
  **group** boundary with roles, not per-account rows plus join tables.
- Manycat Railway/Neon coupling (pool slots, per-project Neon roles) — Atlas
  runtime must sit behind an adapter, not a provider-specific table.
- Manycat social/cat branding, content feed, billing columns.
- Minimachines Modal sandbox coupling and `mm_` branding/namespaces.
- Minimachines machine-identity-as-primary-key for jobs — Atlas binds runs to
  specialist versions, not machine names; no pod/VM identity in domain model.
- Afreka H3/geo/crowdsource network — out of MVP scope.
- WorkOS (minimachines) — Atlas uses NextAuth like manycat; fewer external
  accounts required to boot locally.

## 3. Security / coupling risks

- Reference `.env`, OAuth apps, Modal/Railway/Neon/WorkOS credentials, Resend
  keys, and deployed domains must not be referenced. Atlas gets fresh
  `.env.example` with generated local-only secrets.
- Manycat compose mounts `docker.sock` into the orchestrator — acceptable
  locally, never in production manifests.
- Copying schema wholesale would import billing/provider columns and their
  assumptions; Atlas schema is written fresh from spec §11.
- No unpublished workspace package from a reference may be depended on.

## 4. Smallest implementation approach for Atlas

- Keep the existing T3 scaffold (Next.js App Router, tRPC, Drizzle, Tailwind,
  shadcn-style ui, pnpm). Landing page components stay.
- One new schema file implementing spec §11 tables with `atlas_*` prefix,
  `varchar().$type<>()` unions, group-scoped indexes.
- NextAuth v5 (only new app dependency of substance) + Drizzle adapter tables.
- Central `authorize(groupId, role)` helper used by every tRPC procedure and
  API route; cross-group denial tests on it.
- CLI: one file in `packages/cli`, device flow against `/api/v1/auth/device/*`.
- Runs: Postgres-backed queue (`FOR UPDATE SKIP LOCKED`) before any Redis
  dependency; runtime = local process adapter behind an interface.
- Object storage: S3-compatible (MinIO locally) via `@aws-sdk/client-s3` only
  when artifact upload lands.
- compose: postgres + redis + minio; app on host for dev; multi-stage
  Dockerfile for prod; kustomize-style manifests after the vertical slice
  works.

## 5. Isolation statement

All three reference repositories remain read-only. Atlas has **no runtime,
build, test, or deploy dependency** on manycat, minimachines, or afreka. No
credential, identifier, bucket, database, OAuth app, domain, or deployment
target is shared. Atlas compiles, runs, tests, and deploys from this
repository alone.

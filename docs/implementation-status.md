# Implementation status

## Completed
- Reference audit: `docs/reference-audit.md` (references remain read-only;
  zero runtime dependency on them).
- **Auth**: WorkOS AuthKit (middleware, `/sign-in`, `/sign-up`,
  `/auth/callback`); `getSessionUser` upserts local `users` rows.
- **Schema**: full spec §11 Drizzle schema (`atlas_*`), migration
  `drizzle/0000_*.sql`, seed (`pnpm db:seed`) for the acceptance scenario.
- **Groups & authz**: create/list/members/invite/accept/revoke (hashed
  expiring tokens); central `requireGroupRole`/`requireWorkspaceAccess`;
  cross-group denial tested.
- **Chat & specialists**: prompt-first homepage; prompt survives auth via
  `/new` return path; workspace chooser (personal / group / create group);
  draft manifest + version 1 + seeded thread; chat with polling, run status,
  correction capture (accept/reject/edit) and explicit promotion.
- **Atlas CLI** (`packages/cli`, bin `atlas`): device login (RFC 8628-style,
  hash-only codes/tokens, keychain-backed on macOS), logout/whoami,
  group list/create/use, member invite, init (atlas.yaml), link, status,
  source add/list/sync/remove (glob rules, default secret rejection client
  AND server side, dry-run manifest, content-hash dedupe), specialist
  create/list/inspect/run/eval/deploy, logs, wait, open, api-key
  create/list/revoke.
- **Runs**: Postgres queue (`FOR UPDATE SKIP LOCKED`), `pnpm worker`,
  local runtime adapter behind `executeRun`, run events, artifacts, frozen
  specialist version + source snapshot per run, idempotency keys.
- **Model gateway**: single seam (`src/server/model/gateway.ts`); Anthropic
  via fetch when `ANTHROPIC_API_KEY` set, deterministic stub otherwise.
- **Corrections → learning**: kinds per spec; promotion to evaluation case,
  manifest example (cuts new version), or memory — explicit only.
- **Evaluations**: default suite, cases (incl. from corrections), immutable
  eval runs bound to specialist version (`atlas specialist eval`); deploy
  gated on passing run when a suite exists. Ponytail review pass removed
  tRPC routers with no callers (serviceKey, evaluation, most of run) — the
  CLI REST surface and shared server modules are the single path.
- **Deployment & API**: deployments freeze version; scoped service keys
  (hash-only, shown once, rate-limited, revocable);
  `POST /v1/specialists/{id}/invoke` (202+runId), run get/events (SSE or
  JSON)/artifacts/cancel; api_invocations + audit events throughout.
- **Infra**: docker-compose (pg 5442 / redis 6389 / minio 9010),
  multi-stage `Dockerfile` (web `runner` + `worker` targets),
  `/api/health` + `/api/ready`, `k8s/base` kustomize manifests,
  `.env.example` documenting every operator-created key.

## Validation (all run locally, all passing)
- `pnpm format:check` / `format:write` ✓
- `pnpm lint` ✓ (no warnings)
- `pnpm typecheck` ✓
- `pnpm test` ✓ — 10 tests: authz cross-group denial, run pipeline
  end-to-end (stub model), idempotency, eval grading, service-key
  mint/scope/revoke, deployment freeze
- `packages/cli`: `pnpm build` ✓, `pnpm test` ✓ (glob/secret/walk)
- `pnpm db:push`, `db:generate`, `db:seed` ✓ against local container
- `SKIP_ENV_VALIDATION=1 pnpm build` ✓ (production build)

## Remaining / blockers
- **WorkOS credentials**: operator must create a fresh Atlas app
  (`.env.example` steps). `.env` currently has placeholders, so the browser
  sign-in round-trip (and device-code approval page) can't be exercised
  until real test keys exist. All non-session paths are tested.
- **ANTHROPIC_API_KEY**: unset/empty → stub model. (The shell-exported key
  found locally had no credits; tests force the stub.)
- Object storage (minio) is provisioned but artifacts currently store
  inline in Postgres; S3 upload lands when artifact sizes need it.
- Runtime isolation is a local in-process adapter behind `executeRun`;
  container/microVM runtime is the designed swap point.
- Docker image build not run locally (no registry); Dockerfile follows the
  standard standalone pattern.

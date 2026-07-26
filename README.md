# Atlas Labs

Atlas lets people and teams turn private knowledge and working methods into
collaborative specialist AI workspaces used through chat, a CLI, and scoped
APIs. Full product spec: `Atlas-Labs-Product-Spec.md`.

## Stack

Next.js App Router · TypeScript · Tailwind · tRPC · Drizzle · PostgreSQL ·
WorkOS AuthKit · pnpm workspace (`packages/cli` = `@atlaslabs/cli`).

## Clean start

```bash
cp .env.example .env          # then fill in AUTH + WORKOS values
docker compose up -d          # postgres :5442, redis :6389, minio :9010
pnpm install
pnpm db:migrate               # or db:push during development
pnpm db:seed                  # acceptance-scenario seed (optional)
pnpm dev                      # web app on :3000
pnpm worker                   # run worker (separate terminal)
```

WorkOS: create a **new** application at dashboard.workos.com (steps in
`.env.example`). Without `ANTHROPIC_API_KEY`, specialist runs use a
deterministic stub model.

## Atlas CLI

```bash
cd packages/cli && pnpm build && npm link   # or: pnpm dev -- <cmd>
atlas login                                  # browser device flow
atlas group create "Atlas Labs Engineering"
atlas init                                   # writes atlas.yaml
atlas source sync                            # dry-run manifest, secret-safe
atlas specialist create "Review changes against our architecture"
atlas specialist run <slug> "Review the login flow"
atlas wait && atlas logs
atlas specialist deploy <slug>
atlas api-key create <slug>
```

## Specialist API (scoped service keys)

```text
POST /v1/specialists/{id}/invoke   (202 → runId; idempotencyKey required)
GET  /v1/runs/{id}
GET  /v1/runs/{id}/events          (SSE with Accept: text/event-stream)
GET  /v1/runs/{id}/artifacts
POST /v1/runs/{id}/cancel
```

Auth: `Authorization: Bearer atlas_sk_…` — hashed at rest, scoped, rate
limited, revocable.

## Validation

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Production

- `Dockerfile` — multi-stage web image (`runner`) and run worker (`worker`).
- `k8s/base` — kustomize manifests; external managed Postgres/objects,
  secrets via cloud secret manager.
- Health: `/api/health` (live), `/api/ready` (db).

## Status

See `docs/implementation-status.md` and `docs/reference-audit.md`.

# Deployments that talk back

**Date:** 2026-07-27
**Status:** implemented

A space builds an app; Railway runs it. This is how the running container tells
Atlas where it is and keeps everyone invited to the project informed — without
a login inside the container.

---

## The problem with logging in

A deployed container has no human at a keyboard, so it cannot run `atlas login`.
The obvious shortcut — bake the deployer's PAT into the image — is the wrong
one: that token is a full user session, it lands in a registry layer, and it
outlives the deploy that created it. Anyone who pulls the image becomes the
person who deployed it.

## Deploy tokens

A third credential kind, alongside `atlas_pat_` (user) and `atlas_sk_` (service
key):

| | |
|---|---|
| Prefix | `atlas_dt_` |
| Scope | one machine, one workspace — never a user session |
| Capabilities | report a live URL · post a project update · heartbeat |
| Lifetime | rotated on every deploy, revoked when the space stops, 30-day TTL |
| Delivery | `railway variables --set` at deploy time, never baked into a layer |
| Budget | 200 notifications per token, counted in Postgres |

The machine id comes from the token, never from the request body, so a
deployment cannot post about a project that is not its own. The endpoints live
under `/api/v1/vm/*` with their own verifier — separate from `/api/v1/cli/*` so
no route can drift into accepting the wrong credential.

**Assume it leaks.** It runs inside code an agent generated and a user edited.
The design question was never "can this be kept secret" but "what is the worst
a holder can do", and the answer is: post noise to one project until its budget
runs out, then nothing.

| File | Role |
|---|---|
| `server/deploy/tokens.ts` | mint · verify · revoke · claim quota |
| `server/deploy/notify.ts` | audience resolution + fan-out |
| `app/api/v1/vm/{ready,notify,heartbeat}` | the whole surface |
| `server/spaces/scaffold.ts` | Dockerfile installs the CLI; entrypoint reports |
| `server/railway.ts` | mints per deploy, injects as `ATLAS_DEPLOY_TOKEN` |

## How the container reports

The scaffold Dockerfile installs `@atlaslabsnpm/cli` and runs
`atlas-entrypoint.sh`, which:

1. starts the app,
2. polls the local port until it answers,
3. calls `atlas vm ready --url $RAILWAY_PUBLIC_DOMAIN` in the background.

Order matters. The report never blocks or fails the server — a deployment that
serves traffic but cannot check in is a working deployment with a missing
notification, not a broken one. Every `atlas vm` command exits 0 when
`ATLAS_DEPLOY_TOKEN` is absent, so an image built without Atlas still runs.

`ready` announces only when the URL changes. A container restarting every
thirty seconds must not mail the team every thirty seconds.

## Who hears about it

`projectAudience()` resolves through the existing boundary — a personal
workspace has one member, a group workspace resolves through `memberships`.
There is no second audience model, so someone removed from a group stops
receiving updates by the same mechanism that stops them opening the space.

Two destinations:

- **The thread, always.** Durable, in the place the work happened, and it works
  with no email provider configured. Posted as `role: "system"` with
  `meta.source = "deployment"` — not `assistant`, because the agent did not say
  it.
- **Email, best-effort.** A transport failure degrades to "the update is in the
  thread, nobody was paged".

Update text is user-controlled, so it is escaped, capped at 2,000 characters,
and labelled *Sent by the deployment itself, not by a person.* An update must
never be able to look like a message from a teammate.

## Using it from an app

```sh
# In the deployment, after a migration, a nightly job, whatever matters:
atlas vm notify "Nightly import finished — 12,400 rows, 3 rejected."
```

Nothing else is needed: the token is already in the environment, and the
recipients are whoever has been invited to the project.

## What this does not do

- No inbound control. A deployment cannot be told to do anything from Atlas
  through this path; it only reports.
- No per-member preferences or digesting yet — every member gets every update.
  The budget is the only backstop.
- Slack, Discord, and push go through `server/pings/notify.ts`'s `Notifier`
  interface when they land; this path deliberately reuses it rather than
  growing its own transports.

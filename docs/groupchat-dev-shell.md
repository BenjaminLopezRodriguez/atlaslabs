# Atlas as a group chat with your dev team

**Date:** 2026-07-27
**Status:** design — nothing below is built except where marked ✅

Target: Cursor's agent loop, but the room has people in it, and you can drive it
from a phone on a train. Atlas already has the parts Cursor's single-player
model lacks (workspaces, invites, per-space membership). What is missing is the
*shape of the conversation* and the *ability to leave*.

Sources: manycat `docs/chat-system.md`, `docs/chat-shell-nav.md`, `docs/planes.md`,
`docs/handoffs/2026-07-19-coder-harness-research-master.md`, and the
`agent-harness` FastAPI service.

---

## 1. What Atlas has today ✅

| Piece | Where |
|---|---|
| Thread bound to one space, fixed for its life | `threads.machineId` |
| Agent with read/write/exec on a real VM | `server/spaces/agent.ts` |
| Proposed edits reviewed as diffs before they land | `spaceEdits`, `EditReview` |
| Plan checklist per run | `set_plan` / `complete_step` |
| File map + grep retrieval | `machineIndexes`, `search_code` |
| Deploy scaffold + Railway ship | `spaces/scaffold.ts`, `server/railway.ts` |
| GitHub clone into a space | `server/github.ts` |
| Content-addressed checkpoints | `server/content/merkle.ts`, `server/s3/space-store.ts` |
| Membership + invites per workspace | `memberships`, `invites` |

Every thread is already multi-tenant-safe. Messages already carry
`authorUserId`. The group chat is closer than it looks.

---

## 2. The one thing blocking "from anywhere"

`thread.post` runs the agent **inline, inside the HTTP request** — see
`src/server/api/routers/thread.ts`. A twelve-step run holds the connection open
for minutes. On a phone, on hotel wifi, that request dies and the work is lost
with it, because nothing outside the request knows it was happening.

Manycat hit this and fixed it with a background job:

```text
POST /jobs        → job id, returns immediately
GET  /jobs/:id    → status + accumulated events
POST /jobs/:id/cancel
```

The client polls (`reconcileRun`) and rebuilds thread state from the event log.
Closing the tab does not stop the run; reopening it resumes the view.

**This is the port to do first.** Everything else in "from anywhere" — the iOS
app, the phone browser, the teammate who picks up your thread — depends on the
run outliving the request that started it.

Shape for Atlas (no new service; Atlas is already a Next app with a worker):

| Piece | Approach |
|---|---|
| Job row | `agentRuns` table: threadId, machineId, status, events JSONB, startedBy |
| Start | `thread.post` inserts the row, returns immediately |
| Execute | existing `scripts/worker.ts` loop, or a Vercel function on a queue |
| Read | `thread.run(runId)` polls status + events; thread renders from them |
| Cancel | status flag the tool loop checks between steps |

Manycat's warning applies verbatim: **stop must be honest.** If the run cannot
actually be killed mid-step, the UI says "Stopping…" and blocks new sends until
the in-flight work settles. Never show idle while a writer is still on the box.

---

## 3. Group chat: what actually changes

The chat model manycat landed (`chat-system.md` §4–5) is right and Atlas should
copy it wholesale:

- **One reducer** owns all message state. No component holds parallel state.
- **Agent status is ephemeral** — exactly one live "doing" chip, stripped when
  the run ends. Chips never archive as history spam.
- **Agent prose is unbound; user messages are bubbles.** The thread is the
  agent's canvas; "what I asked for" stays scannable.
- **Diffs are the unit of trust.** ✅ Atlas already does this.

What group chat adds on top, and what each costs:

| Need | Why | Cost |
|---|---|---|
| Author avatars on user messages | Two humans in a room read as one voice today | Small — `authorUserId` already stored |
| `@agent` vs plain chat | Not every message should spend a model call | Small — parse the composer, gate the run |
| Typing / presence | Knowing a teammate is mid-prompt prevents duplicate runs | Medium — needs a live channel |
| **One writer per space** | Two agents editing one VM corrupts both runs | **Required.** Advisory lock on `machineId`; second sender is queued or told who holds it |
| Per-run attribution in the thread | "Who told it to do that" is the group-chat question | Small — stamp `startedByUserId` on the run |
| Read state per member | Otherwise everyone re-reads a 200-message thread | Medium |

The lock is not optional. Manycat's `chat-system.md` calls racing two writers on
one workspace out explicitly, and Atlas's spaces are a shared resource by
design — that is the whole product.

Live channel: Atlas is on Vercel, so **SSE over a Function** is the default —
no extra vendor, works with Fluid Compute. Polling at 4s (what the thread does
today) is honestly fine until presence and typing exist.

---

## 4. Shell: modes, not pages

`chat-shell-nav.md` describes a mode-scoped shell — Build / Work / Chat, each
with its own rail, synced to the URL with `history.pushState` rather than
`router.push` (App Router refetches RSC on push; shallow sync does not).

Atlas should take the **mechanism** and not the mode list. Atlas has one job:
build software with your team. Suggested rails:

| Mode | Rail |
|---|---|
| Build (default) | Threads · Spaces · Deployments · Connections |
| Team | Members · Invites · Activity |

Storage and boot order copied as-is: URL → localStorage → default. Mobile gets
the bottom bar + drawer, which is what makes "from anywhere" feel deliberate
rather than a squeezed desktop layout.

---

## 5. Harness patterns worth stealing (from the research master)

Atlas's `runSpaceAgent` is a forced-tool loop already. The gaps manycat
identified apply to it too:

1. **Surgical edits over whole-file writes.** `write_file` sends the entire
   file; on a 600-line component that is expensive and error-prone. Add
   SEARCH/REPLACE `edit_file` with exact → whitespace-tolerant → structured
   reject. (manycat: `tools/edit_apply.py`, P0, shipped.)
2. **Budgeted repo map every turn**, not an optional tool call. Atlas injects a
   flat path list today; symbol-level context ranked by import degree is the
   Aider pattern manycat adopted at P1.
3. **Trajectory artifact per run** — messages plus truncated tool results,
   stored beside the run. Makes a failed run debuggable after the fact.
4. **Step / wall / cost limits with a named exit status**, instead of the
   current bare `MAX_STEPS` truncation message.
5. **`run_kind`**: `oneshot` (greenfield, force a scaffold write), `modify`
   (minimal diffs, no scaffold), `understand` (read-only). Atlas's single prompt
   mode makes the agent scaffold-happy on repos it should be reading.

Explicitly **not** worth copying: manycat's separate Python harness service.
Atlas's agent is TypeScript, in-process, and reads in one sitting — that is a
feature. Port the patterns, not the deployment topology.

---

## 6. Planes

`planes.md` is the rule Atlas should adopt before it has a reason to:
**control plane never mixes with workload plane.** Atlas's control plane is the
Next app + Postgres; the workload plane is the Modal sandboxes and anything
Railway builds. Concretely, today:

- A space must never receive `DATABASE_URL`, `WORKOS_*`, or `ATLAS_ENCRYPTION_KEY`.
- Deploy tokens are per user, injected per exec, never baked into an image. ✅
- Anything the agent writes into `Dockerfile` is workload-only config. ✅

---

## 7. Order of work

1. **Background runs + polling** — unblocks everything else. §2
2. **One-writer lock per space** — correctness, needed the moment two people share a thread. §3
3. **Reducer + ephemeral status + honest stop** in the thread UI. §3
4. **Author identity in the thread; `@agent` gating.** §3
5. **Mode shell + mobile bottom bar** — what makes the phone case real. §4
6. **`edit_file` SEARCH/REPLACE + `run_kind`** — agent quality. §5
7. iOS app. Everything above is its API.

The landing page now says iOS is coming. Items 1–5 are what has to be true
before that sentence is honest.

---
name: atlas
description: Provision and drive Atlas machines — cloud VMs attached to an Atlas workspace, with public URLs for anything you serve. Use whenever the user asks you to build, run, test, host, or ship anything: offload the work to a machine and drive it end to end with the `atlas` CLI (machine create/exec/put/get/ports/rm), then hand back a live URL. Also provides ping_user, the required way to ask the user a question: it pages them and blocks for their reply instead of stalling in chat. Covers install, login, the offload loop, ports and public URLs, workspace paths, specialists and sources, exit codes, the ping log, cost, and cleanup.
---

# atlas

Remote dev VMs you drive on the user's behalf, each one attached to an Atlas
workspace. A machine is your default place to build and run things — off the
user's laptop, with a public URL at the end instead of "it works locally".

Backed by `@atlaslabsnpm/cli` (binary: `atlas`). Machines run on Modal.

**This file is the spec.** Every command, flag, path rule and exit code below
is read off the CLI source. If something is not here, do not assume it exists —
run `atlas` with no arguments to print the built-in help rather than guessing a
flag.

---

## MUST — offload to a machine

When this skill is active:

- **Run build / install / dev-server / test work on an Atlas machine, not the
  user's laptop.** Don't ask "should I use a VM?" — create one and use it.
- **Drive it end to end** — create → push files → install/build/run → hand back
  a live URL — without stopping after each step to ask permission to continue.
- **Deliver a public URL**, never "it's running on port 3000 locally."
- **Stop the machine when the work is done.** A running machine bills.
- **Never stall in the chat waiting on the user.** If you need them, use
  `ping_user` (below) and keep working on everything that does not depend on
  the answer.
- **Use the CLI, not `curl`.** `atlas` reads the saved token itself, so the
  command shape stays constant and the user approves `atlas` once instead of
  approving a fresh hand-rolled HTTP line every time.

---

## Install

```bash
npm install -g @atlaslabsnpm/cli     # requires Node.js 20+
```

No npm, or a locked-down box:

```bash
curl -fsSL https://www.atlaslabs.id/install.sh | sh
```

Installs one self-contained file to `/usr/local/bin` when writable, else
`~/.local/bin`. Never needs `sudo`; verifies a SHA-256 checksum before anything
lands on PATH.

Single file, no installer at all:

```bash
curl -fsSL https://www.atlaslabs.id/download/atlas.cjs -o atlas.cjs
node atlas.cjs whoami
```

`atlas.cjs` is a valid entrypoint name — the CLI only auto-runs when invoked as
`cli.ts`, `cli.js`, `atlas.cjs`, `atlas.js`, or `atlas`.

---

## Authenticate

```bash
atlas login          # device flow, opens a browser for approval
atlas whoami         # → email (name)
atlas logout         # revokes server-side, then deletes the local token
```

`login` posts to `/api/v1/auth/device/code`, prints a **user code** and a
verification URL, opens the browser, then polls `/api/v1/auth/device/token` at
the server-supplied interval until the user approves or the code expires.

**Never ask the user to paste a token into the chat**, and never print one.
If the browser does not open, the CLI prints `Open this URL manually: …` —
relay that line rather than re-running `login`.

### Where state lives

| | Path |
|---|---|
| Config dir (Windows) | `%APPDATA%\atlas` |
| Config dir (else) | `$XDG_CONFIG_HOME/atlas`, else `~/.config/atlas` |
| Token (macOS) | Keychain, service `id.atlaslabs.cli`, account = your username |
| Token (fallback) | `<config dir>/token`, mode `0600` |
| Settings | `<config dir>/config.json` — `{ baseUrl?, currentGroup? }` |
| Install id | `<config dir>/installation` — a continuity hint only, carries no authority |

`ATLAS_BASE_URL` overrides the server; `baseUrl` in `config.json` also does.
Default is `https://www.atlaslabs.id` — always the **`www`** host. The apex
redirects, and a redirect hop drops the `Authorization` header, so an apex call
lands unauthenticated.

If `whoami` shows an identity you did not expect, check `ATLAS_BASE_URL` and
`config.json` before doing anything else.

---

## Groups and workspaces

Every machine, specialist and source lives in a **workspace**. Which workspace
is resolved, in order:

1. `group:` in `atlas.yaml` in the current directory
2. `currentGroup` in `config.json`
3. otherwise, your **personal** workspace

```bash
atlas group list                 # `*` marks the current group
atlas group create "Acme Team"   # creates and switches to it
atlas group use acme-team        # switch
```

A `group` value that names no group you belong to is a hard failure, not a
silent fall back to personal.

### Invite a human

```bash
atlas invite ben@example.com --role builder --machine my-app
atlas member invite ben@example.com builder      # older positional form, still works
```

Roles: `owner` | `builder` | `operator` | `viewer`. Default `operator`.
`--machine <slug>` names the machine they are being brought in for, so the
invite email arrives with the machine id in it. A flag whose value is missing
or is itself another flag is an **error**, not a default — `--machine --role
owner` will not invite someone to a machine called `--role`.

The command prints the accept URL. If email delivery failed it says so and the
link is the fallback — hand the link over rather than re-inviting.

---

## The offload loop

**1. Create a machine.** The slug is required and is a DNS label — lowercase
letters, numbers and dashes, 1–63 chars.

```bash
atlas machine create my-app
# → Created my-app (running)
#   atlas://workspace/my-app

atlas machine create my-app --template <templateId>
```

Creating a slug that already exists is a **409, not a second machine**. That is
deliberate: re-running create is safe and never double-bills.

**2. Push files.** Write locally, then upload.

```bash
atlas put my-app ./server.js server.js          # → /workspace/server.js
atlas put my-app ./index.html public/index.html
```

**3. Start long-running work in the background** so `exec` returns instead of
hanging:

```bash
atlas exec my-app -- 'cd /workspace && (nohup node server.js >/tmp/dev.log 2>&1 &)'
```

**4. Poll until it is up:**

```bash
atlas exec my-app -- 'curl -s -o /dev/null -w %{http_code} localhost:3000'
# not 200 yet? read the log:
atlas exec my-app -- 'tail -50 /tmp/dev.log'
```

**5. Hand back the public URL:**

```bash
atlas ports my-app
```

**6. Stop it when done:**

```bash
atlas machine rm my-app
```

---

## What the machine actually is

Verified on the live image — do not guess beyond this:

| | |
|---|---|
| OS | Debian 12 (bookworm), x86_64, on gVisor |
| User | **root** |
| Workdir | `/workspace` |
| Preinstalled | node v22, npm, pnpm, python3 3.13 + pip, git, curl, gcc, make |
| Exposed ports | **3000 and 8000**, each with a public HTTPS tunnel URL |

**Bind servers to `0.0.0.0`**, not `127.0.0.1`, or the tunnel cannot reach them.

**Ports are fixed when the machine is created.** 3000 and 8000 are the only
ones routable from outside; a server on 5173 is unreachable. Configure the tool
to use 3000 (`vite --port 3000`, `next dev -p 3000`) rather than trying to
expose another port.

Anything else you need — a database, a language runtime — install it in the
machine (`apt-get install -y …`, `pip install`, `npm i -g`). You are root.

---

## `exec` — running commands

```bash
atlas exec <slug> -- <command...>
atlas exec <slug> <command...>        # `--` optional when nothing looks like a flag
```

- Everything after the **first `--`** is the remote command, verbatim,
  including anything that looks like a flag. Without `--`, the whole tail is
  the command.
- Arguments are joined with spaces and run **through a shell**, so `&&`, pipes,
  redirects and subshells work. Quote accordingly.
- stdout goes to stdout, stderr to stderr.
- **`exec` mirrors the remote exit code.** `atlas exec app -- npm test` fails
  your script when the tests fail. Rely on that rather than grepping stdout.
- `exec` is request/response, not a stream: a command that never returns will
  hold the call open. Background anything long (`nohup … &`) and poll.

---

## `put` / `get` — file transfer

```bash
atlas put <slug> <localPath> <remotePath>
atlas get <slug> <remotePath> [localPath|-]
```

Remote paths are **workspace-relative** (the workdir is `/workspace`):

| You write | Result |
|---|---|
| `server.js` | `/workspace/server.js` |
| `public/index.html` | `/workspace/public/index.html` |
| `/workspace/server.js` | accepted; the prefix is stripped |
| `/etc/hosts` | **refused with an error** |

Other absolute paths are refused rather than silently rewritten — turning
`/etc/hosts` into a workspace-relative write is the kind of guess that quietly
puts a file somewhere the user did not ask for.

`get` with no local path, or `-`, writes the bytes to **stdout** — pipe it.

---

## HARD RULE — ask with `ping_user`, never in the chat

When this skill is active and you need something from the user, you **must**
reach them with `ping_user`. Stopping to ask in the chat is not the fallback;
it is the thing this replaces.

```bash
atlas ping_user my-app "Postgres or SQLite for the todo store?" --timeout 300
```

It **blocks until they answer** and prints **only their reply on stdout**, so
capture it and keep going:

```bash
DB=$(atlas ping_user my-app "Postgres or SQLite for the todo store?")
echo "using $DB"
```

Everything else — the question, the reply link, delivery status — goes to
stderr, so `$(...)` gets a clean answer and nothing else.

### Flags

| Flag | Effect |
|---|---|
| `--timeout <seconds>` | How long to wait. Default **300**. Must be a positive number. |
| `--context <label>` | Groups related pings in the log. |
| `--no-wait` | Create the ping and return immediately; read the answer later from the log. |

Flags and their values are stripped out of the question, so
`atlas ping_user app --context db "Postgres or SQLite?"` asks exactly
`Postgres or SQLite?`. An empty question is an error.

While waiting, the CLI polls with backoff starting at 2s and capping at 10s —
a human is not fast, and hammering the API does not make them faster.

### Phrase the question to stand alone

The person reading it sees **only your question**. They do not see the chat,
your plan, or what you just tried. A question that needs the conversation to
make sense is a question they cannot answer from their phone.

| Don't | Do |
|---|---|
| "Should I continue?" | "The migration will drop the `legacy_events` table (14k rows, last written 8 months ago). Drop it, or keep and rename?" |
| "Which one?" | "Auth: Clerk (fastest, $25/mo above 10k MAU) or WorkOS (already in your stack)?" |
| "It failed, what now?" | "`pnpm build` fails on Node 22 with an ESM error in `yaml`. Pin Node 20, or migrate the import?" |

State the choice, the tradeoff, and what you'll do by default. One question per
ping.

### When to ping, and when not to

**Ping** for decisions that are genuinely theirs: product and design calls,
anything irreversible or destructive, spending money, credentials you do not
have, a fork where both branches are defensible.

**Do not ping** for anything you can sensibly default. A ping costs the user an
interruption; spending one on "should I name it `utils.ts`?" trains them to
ignore the next one — which will be the one that mattered.

### Timeouts are not failures

If nobody answers, `ping_user` exits **2** and the reply link stays live. That
is your cue to **proceed on the default you already stated** and say so in your
summary — not to stall, and not to ask again. Their answer still lands in the
log for whoever picks the work up next.

### Read the log before you start

The log is the shared memory of decisions on this machine. Read it at the start
of any session you did not personally begin — it is how you inherit choices
made by the user, or by another agent, that are not in your context:

```bash
atlas ping log my-app
```

```
[2026-07-27 07:01] ANSWERED (architecture)
  Q: Postgres or SQLite for the todo store?
  A: Postgres. We already run it for everything else.
```

Statuses are `pending` | `answered` | `expired` | `cancelled`. Treat answered
pings as settled. Do not re-ask a question the log already answers, and do not
quietly contradict one — if you think a past decision is wrong, ping with the
new information rather than overriding it.

---

## Projects, sources and specialists

This half of the CLI is about giving an Atlas **specialist** (a deployed agent)
the context of a local codebase. Skip it if you are only driving machines.

```bash
atlas init      # writes atlas.yaml
atlas link      # confirm which workspace/specialist this project resolves to
atlas status    # server, identity, workspace, and each source's sync status
```

### `atlas.yaml`

```yaml
version: 1
group: personal            # or a group slug
workspace: ""              # optional explicit workspace
specialist: ""             # slug; makes `logs`/`wait`/`api-key` argument-free
sources:
  - path: .
    include: ["src/**", "docs/**", "README.md"]
    exclude: [".env*", "node_modules/**", ".git/**"]
permissions:
  commands: []
```

Globs support `*` (within a path segment), `**` (across segments) and `?`.

### Syncing source

```bash
atlas source add <path>          # appends to atlas.yaml
atlas source list                # id, name, origin, status
atlas source sync                # prints a manifest, then asks before uploading
atlas source sync --yes          # or -y, non-interactive
atlas source remove <sourceId>
```

`sync` walks each source root and **refuses to upload** anything matching the
trust-boundary rules. These are not warnings — the files are dropped, and the
reason is printed per file:

| Rejected | Examples |
|---|---|
| Secret paths | `.env*`, `.git/`, `node_modules/`, `*.pem/.key/.p12/.pfx/.jks/.keystore`, `id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa`, `credentials.json`, `secrets.yaml`, `.aws/ .ssh/ .gnupg/ .kube/ .docker/`, `.netrc`, `.npmrc`, `serviceaccount*.json` |
| Secret content | PEM private-key headers, `AKIA…` AWS keys, `sk-…`, `ghp_…`, `xox[baprs]-…` |
| Too large | over **512 KB** |
| Binary | any file containing a NUL byte |

Always excluded on top of your `exclude` list: `.env*`, `node_modules/**`,
`.git/**`, `.next/**`, `dist/**`, `build/**`, `*.lock`, `pnpm-lock.yaml`.
Symlinks are never followed.

An unchanged sync is a no-op that reports the existing version rather than
minting a new one.

### Specialists and runs

```bash
atlas specialist create "reviews our API PRs for auth mistakes"
atlas specialist list                       # slug, name, [state]
atlas specialist inspect <slug>             # full JSON
atlas specialist run <slug> "<message>"     # → prints a run id
atlas specialist deploy <slug>
atlas specialist eval <slug>                # exits 1 if the evaluation failed

atlas logs [runId]     # run status + numbered event stream
atlas wait [runId]     # blocks; exits 1 if the run failed
```

With `specialist:` set in `atlas.yaml`, `logs` and `wait` default to that
specialist's most recent run.

### API keys

```bash
atlas api-key create <specialist> [label]   # secret is printed ONCE
atlas api-key list <specialist>             # id, prefix, label, scopes
atlas api-key revoke <keyId>
```

The secret is shown once and never again. **Do not echo it into chat, logs, or
a file in the repo** — hand it to the user through whatever channel they told
you to use, or leave it on their terminal and say where it is.

---

## Devices

```bash
atlas device list           # id, kind, label, platform, last seen, [current]
atlas device rm <deviceId>  # revokes it; its tokens stop working immediately
```

Every `atlas login` registers a device. Revoking one invalidates every token it
holds. Revocation is scoped to the caller — someone else's device id is a
no-op, not a leak.

---

## Command reference

| Command | Purpose |
|---|---|
| `atlas login` | Device-flow sign-in |
| `atlas logout` | Revoke server-side and delete the local token |
| `atlas whoami` | Print the signed-in email |
| `atlas status` | Server, identity, workspace, source status |
| `atlas group list \| create <name> \| use <slug>` | Groups |
| `atlas invite <email> [--role <r>] [--machine <slug>]` | Invite a human |
| `atlas member invite <email> [role]` | Older alias for the above |
| `atlas init` | Write `atlas.yaml` |
| `atlas link` | Show the resolved workspace/specialist |
| `atlas open [slug]` | Open `atlas://workspace/<slug>`, or the web app |
| `atlas source add <path> \| list \| sync [--yes] \| remove <id>` | Source sync |
| `atlas specialist create "<prompt>" \| list \| inspect <slug>` | Specialists |
| `atlas specialist run <slug> "<msg>" \| eval <slug> \| deploy <slug>` | Specialists |
| `atlas logs [runId]` / `atlas wait [runId]` | Run output / block on a run |
| `atlas api-key create <specialist> [label] \| list \| revoke <keyId>` | API keys |
| `atlas device list \| rm <deviceId>` | Devices |
| `atlas machine create <slug> [--template <id>]` | Provision → prints the URL |
| `atlas machine list` (`ls`) | Your machines, status, ports |
| `atlas machine status <slug>` | Status + ports |
| `atlas machine rm <slug>` (`remove`, `stop`) | Terminate — this is how billing stops |
| `atlas machine suspend \| resume <slug>` | See the caveat below |
| `atlas exec <slug> -- <cmd…>` | Run a command; **mirrors the remote exit code** |
| `atlas put <slug> <local> <remote>` | Upload into the workspace |
| `atlas get <slug> <remote> [local\|-]` | Download; `-` writes to stdout |
| `atlas ports <slug>` | Ports and their public URLs |
| `atlas ping_user <slug> "<q>" [--timeout <s>] [--context <l>] [--no-wait]` | **Ask the user; blocks; prints the reply** |
| `atlas ping log <slug>` | The question/answer log for this machine |

An unrecognised command prints the built-in help. `atlas ping_user` is also
spelled `ping-user`; `atlas invite` is also `invite_to_space` / `invite-to-space`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Any CLI-level failure: not logged in, unauthorized, bad usage, HTTP error, failed run, failed evaluation |
| `2` | `ping_user` timed out with no reply — **the ping is still live**, not lost |
| *remote* | `atlas exec` propagates the command's own exit code |

Error output goes to **stderr**, so `2>/dev/null` on an `atlas` call will hide
the reason a script just died. Don't.

---

## Cost and lifecycle

- Machines bill while running. Created with a **1-hour hard timeout** and a
  **5-minute idle timeout**, so a forgotten machine cannot bill indefinitely —
  but do not lean on that. `atlas machine rm <slug>` when the work is done.
- **Suspend is not available** on the Modal backend and returns a 409. The CLI
  exposes `suspend`/`resume` because the API does, but they will fail today.
- **Stopping a machine destroys its filesystem. There is no resume.** Anything
  that must survive belongs in git, or back on the user's disk via `atlas get`.
  Say that plainly rather than implying a stopped machine can be revived.
- Re-running `atlas machine create <slug>` for an existing slug is a clean
  conflict, not a second VM.

---

## Safety

- **Never print tokens** — not the device token, not an `atlas api-key create`
  secret, not the contents of the config dir. `whoami` prints an email, which
  is fine.
- A machine's tunnel URLs are **public** to anyone holding the link
  (unguessable hostnames, no auth). Don't serve the user's secrets from one,
  and say so when handing over a URL for something sensitive.
- Machines are scoped to a workspace. Another user requesting one gets a 404 —
  if you see that unexpectedly, you are authenticated as the wrong identity.
- `atlas source sync` rejects secrets by default. If a file you need is being
  dropped as "likely secret content", that is a signal to look at the file, not
  a reason to widen the include globs.
- `apt-get` / `npm i -g` inside the machine is free real estate; the same
  commands on the user's laptop are not. Keep installs inside the VM.

---

## HTTP API

Reach for raw HTTP only for what the CLI does not cover. Same host, header
`Authorization: Bearer <token>`, all owner-scoped.

| Method & path | Purpose |
|---|---|
| `POST /api/v1/auth/device/code` | Start the device flow (no auth) |
| `POST /api/v1/auth/device/token` | Exchange a device code for a token (no auth) |
| `GET /api/v1/cli/whoami` | Identity |
| `DELETE /api/v1/cli/token` | Revoke the current token |
| `GET /api/v1/cli/workspaces` | Personal + group workspaces |
| `GET /POST /api/v1/cli/groups` | List / create groups |
| `POST /api/v1/cli/invitations` | Invite to a group, optionally naming a machine |
| `GET /DELETE /api/v1/cli/sources` | List / revoke sources |
| `POST /api/v1/cli/sources/sync` | Upload a source version |
| `GET /POST /api/v1/cli/specialists` | List / create specialists |
| `POST /api/v1/cli/specialists/deploy` | Deploy a specialist |
| `POST /api/v1/cli/evaluations/run` | Run an evaluation |
| `GET /POST /api/v1/cli/runs` | Read a run / start one |
| `GET /POST /DELETE /api/v1/cli/api-keys` | Specialist API keys |
| `GET /api/v1/devices`, `POST /api/v1/devices/<id>/revoke` | Devices |
| `GET /POST /api/v1/machines` | List / create machines |
| `GET /api/v1/machines/by-slug/<slug>?workspaceId=…` | Resolve a slug |
| `POST /api/v1/machines/<id>/exec` `{cmd}` | Run a command |
| `PUT /GET /api/v1/machines/<id>/files/<path>` | Write / read a workspace file |
| `GET /api/v1/machines/<id>/ports` | Ports and public URLs |
| `POST /api/v1/machines/<id>/stop` | Terminate |
| `POST /api/v1/machines/<id>/suspend` / `resume` | 409 on the Modal backend |
| `GET /POST /api/v1/machines/<id>/ping` | Read the ping log / ask a question |
| `GET /api/v1/pings/<id>` | Poll one ping for its answer |

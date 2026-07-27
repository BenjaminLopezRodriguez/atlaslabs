# @atlaslabsnpm/cli

The Atlas CLI. Drive **Atlas machines** — cloud VMs attached to a workspace that
you and your agents work in together, with a public URL for anything you serve.

```bash
npm install -g @atlaslabsnpm/cli
atlas login
```

Or without npm — one self-contained file, no dependencies beyond Node 20+:

```bash
curl -fsSL https://www.atlaslabs.id/install.sh | sh
```

## Quick start

```bash
atlas machine create my-app                       # provision a VM
atlas put my-app ./server.js server.js            # push files
atlas exec my-app -- 'npm install && npm test'    # run work (exit code is mirrored)
atlas ports my-app                                # public HTTPS URL
atlas machine rm my-app                           # stop billing
```

Paths are relative to `/workspace`. Bind servers to `0.0.0.0` on port **3000** or
**8000** — those are the ports routed from outside, and they are fixed when the
machine is created.

## Asking the user a question

`ping_user` reaches the human and blocks for their reply, so an agent can get an
answer inline instead of stalling. Only their reply goes to stdout:

```bash
DB=$(atlas ping_user my-app "Postgres or SQLite for the todo store?")
atlas ping log my-app        # the full question/answer log for this machine
```

On timeout it exits `2` with the reply link still live — proceed on your default
rather than waiting.

## Commands

| Command | Purpose |
|---|---|
| `atlas login` / `whoami` / `logout` | Auth (device flow; token goes to your keychain) |
| `atlas machine create\|list\|status\|rm` | Machine lifecycle |
| `atlas exec <slug> -- <cmd…>` | Run a command; mirrors its exit code |
| `atlas put` / `get` | Upload / download workspace files |
| `atlas ports <slug>` | Public URLs |
| `atlas ping_user` / `ping log` | Ask the user; read the log |
| `atlas open <slug>` | Open in Atlas Browser |
| `atlas device list` / `rm` | Signed-in devices; revoke one |
| `atlas source` / `specialist` / `group` | Workspace, source and specialist management |

Full docs: <https://www.atlaslabs.id/docs/cli>

## Configuration

| Variable | Purpose |
|---|---|
| `ATLAS_BASE_URL` | Point at a different Atlas server (default: production) |
| `XDG_CONFIG_HOME` | Where config lives (default `~/.config/atlas`) |

Requires Node.js 20 or newer.

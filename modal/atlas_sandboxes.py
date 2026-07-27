"""
Atlas machine bridge.

atlaslabs is TypeScript; the Modal client is Python. This deployed app is the
seam: it wraps `modal.Sandbox` in a small authenticated HTTP surface that
`src/server/machines/modal-driver.ts` calls. Route shapes mirror the
MachineDriver interface exactly, so the TS side stays driver-agnostic.

One ASGI app rather than six `fastapi_endpoint` functions: a single container
serves every route, and FastAPI's dependency injection (used here for auth) is
well-defined in this form.

Deploy:  modal deploy modal/atlas_sandboxes.py
Secret:  modal secret create atlas-bridge ATLAS_BRIDGE_SECRET=<random>
"""

import base64
import os
import secrets as pysecrets
from typing import Any

import modal

app = modal.App("atlas-sandboxes")

image = modal.Image.debian_slim().pip_install("fastapi[standard]")

# What a workspace machine actually boots.
#
# Node is installed from the official tarball rather than apt: Debian 12 ships
# an ancient Node, and NodeSource adds an apt repo round-trip on every rebuild.
# Python 3.13, pip, gcc and make come with debian_slim.
NODE_VERSION = "22.14.0"

SANDBOX_IMAGE = (
    modal.Image.debian_slim()
    .apt_install("git", "curl", "ca-certificates", "xz-utils")
    .run_commands(
        f"curl -fsSL https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz",
        "tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1",
        "rm /tmp/node.tar.xz",
        "npm install -g pnpm@latest",
    )
)

bridge_secret = modal.Secret.from_name("atlas-bridge")

# Ports are fixed at create time — Modal freezes the encrypted port set when the
# sandbox is provisioned, so this cannot be widened later.
DEFAULT_PORTS = [3000, 8000]

# An idle sandbox is still billed. Never leave one running unbounded.
DEFAULT_TIMEOUT = 60 * 60
DEFAULT_IDLE_TIMEOUT = 5 * 60


@app.function(image=image, secrets=[bridge_secret], timeout=900)
@modal.concurrent(max_inputs=20)
@modal.asgi_app(label="atlas-bridge")
def bridge():
    from fastapi import Depends, FastAPI, Header, HTTPException

    api = FastAPI(title="Atlas machine bridge")

    def require_secret(authorization: str = Header(default="")) -> None:
        """Fails closed: no secret configured, no header, or mismatch all deny."""
        expected = os.environ.get("ATLAS_BRIDGE_SECRET", "")
        token = authorization[7:] if authorization.startswith("Bearer ") else ""
        if not expected or not pysecrets.compare_digest(token, expected):
            raise HTTPException(status_code=401, detail="unauthorized")

    def sandbox(handle: str) -> modal.Sandbox:
        return modal.Sandbox.from_id(handle)

    def tunnel_urls(sb: modal.Sandbox) -> dict[int, str]:
        try:
            return {p: t.url for p, t in sb.tunnels().items()}
        except Exception:
            return {}  # a tunnel not yet up is not fatal

    @api.post("/create", dependencies=[Depends(require_secret)])
    def create(item: dict[str, Any]):
        ports = [int(p) for p in (item.get("ports") or DEFAULT_PORTS)]
        sb = modal.Sandbox.create(
            "sleep", "infinity",
            app=app,
            image=SANDBOX_IMAGE,
            timeout=int(item.get("timeout") or DEFAULT_TIMEOUT),
            idle_timeout=int(item.get("idleTimeout") or DEFAULT_IDLE_TIMEOUT),
            encrypted_ports=ports,
            workdir="/workspace",
        )
        # No wait_until_ready(): that requires a readiness probe, and a
        # `sleep infinity` sandbox is usable the moment create() returns.
        urls = tunnel_urls(sb)
        return {
            "handle": sb.object_id,
            "ports": [
                {"port": p, "label": f"port {p}", "url": urls.get(p)}
                for p in ports
            ],
        }

    @api.post("/exec", dependencies=[Depends(require_secret)])
    def run_exec(item: dict[str, Any]):
        sb = sandbox(item["handle"])
        # The whole string is the caller's own command for their own sandbox, so
        # a shell is used deliberately — `atlas exec demo -- a && b` must work.
        # No untrusted data is interpolated in; the caller already has arbitrary
        # exec on this machine by design.
        proc = sb.exec(
            "sh", "-lc", item["cmd"],
            workdir=item.get("cwd") or None,
            timeout=600,
        )
        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        proc.wait()
        return {
            "exitCode": proc.returncode or 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    @api.post("/put", dependencies=[Depends(require_secret)])
    def put_file(item: dict[str, Any]):
        sb = sandbox(item["handle"])
        path = item["path"]
        body = base64.b64decode(item["contentBase64"])
        parent = "/".join(path.split("/")[:-1])
        if parent:
            sb.mkdir(parent, parents=True)
        with sb.open(path, "wb") as f:
            f.write(body)
        return {"ok": True, "bytes": len(body)}

    @api.post("/get", dependencies=[Depends(require_secret)])
    def get_file(item: dict[str, Any]):
        sb = sandbox(item["handle"])
        try:
            with sb.open(item["path"], "rb") as f:
                data = f.read()
        except Exception:
            return {"found": False}
        return {"found": True, "contentBase64": base64.b64encode(data).decode()}

    @api.post("/status", dependencies=[Depends(require_secret)])
    def status(item: dict[str, Any]):
        sb = sandbox(item["handle"])
        code = sb.poll()
        return {
            "running": code is None,
            "returncode": code,
            "ports": [
                {"port": p, "url": u} for p, u in tunnel_urls(sb).items()
            ],
        }

    @api.post("/terminate", dependencies=[Depends(require_secret)])
    def terminate(item: dict[str, Any]):
        try:
            sandbox(item["handle"]).terminate()
        except Exception:
            pass  # already gone is success
        return {"ok": True}

    return api

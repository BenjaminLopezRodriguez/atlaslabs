import type { MachinePort } from "@/server/db/schema";

import {
  DriverError,
  type CreateInput,
  type CreateResult,
  type ExecInput,
  type ExecResult,
  type MachineDriver,
} from "./driver";

/**
 * Real machines, backed by Modal sandboxes.
 *
 * The Modal client is Python, so this talks to the deployed bridge in
 * `modal/atlas_sandboxes.py` over HTTPS. Route shapes mirror MachineDriver
 * one-to-one, so nothing above this file knows which driver is in use.
 *
 * Config:
 *   ATLAS_MODAL_BRIDGE_URL     https://<workspace>--atlas-bridge.modal.run
 *   ATLAS_MODAL_BRIDGE_SECRET  shared secret, also set as the Modal secret
 *                              `atlas-bridge` / ATLAS_BRIDGE_SECRET
 */

type BridgePort = { port: number; label?: string; url?: string | null };

function config() {
  const baseUrl = process.env.ATLAS_MODAL_BRIDGE_URL;
  const secret = process.env.ATLAS_MODAL_BRIDGE_SECRET;
  if (!baseUrl || !secret) {
    throw new DriverError(
      "Modal driver is not configured — set ATLAS_MODAL_BRIDGE_URL and ATLAS_MODAL_BRIDGE_SECRET.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

async function call<T>(route: string, body: unknown): Promise<T> {
  const { baseUrl, secret } = config();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      // A hung provider must not hold a request open forever.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new DriverError(
      `Modal bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The bridge secret must never reach a client or a log line.
    throw new DriverError(
      `Modal bridge ${route} failed (${res.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
    );
  }

  return (await res.json()) as T;
}

function toPorts(ports: BridgePort[] | undefined): MachinePort[] {
  return (ports ?? []).map((p) => ({
    port: p.port,
    label: p.label,
    internalUrl: p.url ?? undefined,
  }));
}

class ModalDriver implements MachineDriver {
  readonly kind = "modal";
  readonly supportsSuspend = false;

  async create(input: CreateInput): Promise<CreateResult> {
    const res = await call<{ handle: string; ports: BridgePort[] }>("/create", {
      templateId: input.templateId ?? null,
      region: input.region ?? null,
    });
    return { handle: res.handle, ports: toPorts(res.ports) };
  }

  async stop(handle: string): Promise<void> {
    await call<{ ok: boolean }>("/terminate", { handle });
  }

  /*
   * A Modal sandbox is running or terminated — there is no suspend that keeps
   * the filesystem. Aliasing suspend to stop would destroy a user's work while
   * the UI said "suspended", so both refuse. `supportsSuspend = false` means
   * the store rejects these before they are ever called.
   */
  suspend(_handle: string): Promise<void> {
    return Promise.reject(
      new DriverError("Modal machines cannot be suspended — stop or keep running."),
    );
  }

  resume(_handle: string): Promise<void> {
    return Promise.reject(
      new DriverError("Modal machines cannot be resumed — create a new machine."),
    );
  }

  exec(handle: string, input: ExecInput): Promise<ExecResult> {
    const started = Date.now();
    return call<Omit<ExecResult, "durationMs">>("/exec", {
      handle,
      cmd: input.cmd,
      cwd: input.cwd ?? null,
    }).then((res) => ({ ...res, durationMs: Date.now() - started }));
  }

  async putFile(
    handle: string,
    path: string,
    body: Uint8Array,
  ): Promise<void> {
    await call<{ ok: boolean }>("/put", {
      handle,
      path: absolute(path),
      contentBase64: Buffer.from(body).toString("base64"),
    });
  }

  async getFile(handle: string, path: string): Promise<Uint8Array | null> {
    const res = await call<{ found: boolean; contentBase64?: string }>("/get", {
      handle,
      path: absolute(path),
    });
    if (!res.found || !res.contentBase64) return null;
    return new Uint8Array(Buffer.from(res.contentBase64, "base64"));
  }
}

/** Store paths are workspace-relative; the sandbox workdir is /workspace. */
function absolute(path: string): string {
  return path.startsWith("/") ? path : `/workspace/${path}`;
}

export const modalDriver = new ModalDriver();

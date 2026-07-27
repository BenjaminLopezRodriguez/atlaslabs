import { randomUUID } from "node:crypto";

import type { MachinePort } from "@/server/db/schema";

import {
  DriverError,
  type CreateInput,
  type CreateResult,
  type ExecInput,
  type ExecResult,
  type MachineDriver,
} from "./driver";

/** Ports a template is assumed to expose. Replaced by real template manifests. */
const TEMPLATE_PORTS: Record<string, MachinePort[]> = {
  "node-ts": [{ port: 3000, label: "dev server" }],
  "next-app": [{ port: 3000, label: "dev server" }],
  python: [{ port: 8000, label: "app" }],
};

const DEFAULT_PORTS: MachinePort[] = [{ port: 3000, label: "dev server" }];

/**
 * In-memory machine backend.
 *
 * Exists so the REST surface, the CLI and Atlas Browser can be built and tested
 * against a stable contract before real provisioning lands. It never runs a
 * command — `exec` echoes deterministically so tests can assert on it.
 *
 * State is per-process and intentionally lost on restart. Anything that must
 * survive (status, ports, exec history) is persisted by the store, not here.
 */
class MockDriver implements MachineDriver {
  readonly kind = "mock";
  readonly supportsSuspend = true;

  private files = new Map<string, Map<string, Uint8Array>>();
  private live = new Set<string>();

  create(input: CreateInput): Promise<CreateResult> {
    const handle = `mock_${randomUUID()}`;
    this.files.set(handle, new Map());
    this.live.add(handle);
    return Promise.resolve({
      handle,
      ports: input.templateId
        ? (TEMPLATE_PORTS[input.templateId] ?? DEFAULT_PORTS)
        : DEFAULT_PORTS,
    });
  }

  stop(handle: string): Promise<void> {
    this.live.delete(handle);
    this.files.delete(handle);
    return Promise.resolve();
  }

  suspend(handle: string): Promise<void> {
    this.live.delete(handle);
    // filesystem survives suspension — that is the whole point of suspend
    return Promise.resolve();
  }

  resume(handle: string): Promise<void> {
    if (!this.files.has(handle)) this.files.set(handle, new Map());
    this.live.add(handle);
    return Promise.resolve();
  }

  exec(handle: string, input: ExecInput): Promise<ExecResult> {
    this.assertLive(handle);
    // No shell, no child process — this is a stub that echoes its input.
    return Promise.resolve({
      exitCode: 0,
      stdout: `[mock ${handle}] ${input.cwd ? `(${input.cwd}) ` : ""}${input.cmd}\n`,
      stderr: "",
      durationMs: 1,
    });
  }

  putFile(handle: string, path: string, body: Uint8Array): Promise<void> {
    this.assertLive(handle);
    this.files.get(handle)!.set(path, body);
    return Promise.resolve();
  }

  getFile(handle: string, path: string): Promise<Uint8Array | null> {
    this.assertLive(handle);
    return Promise.resolve(this.files.get(handle)?.get(path) ?? null);
  }

  private assertLive(handle: string) {
    if (!this.live.has(handle)) {
      throw new DriverError(`Machine ${handle} is not running`);
    }
  }
}

export const mockDriver = new MockDriver();

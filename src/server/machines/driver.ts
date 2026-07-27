import type { MachinePort } from "@/server/db/schema";

/**
 * What a machine backend must do.
 *
 * Deliberately small: every speculative method here is one a real driver
 * (Modal / Fly / k8s) would have to fake. Grow it when a real driver needs it.
 */
export type ExecInput = {
  cmd: string;
  cwd?: string | null;
  env?: Record<string, string> | null;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CreateInput = {
  templateId?: string | null;
  region?: string | null;
};

export type CreateResult = {
  handle: string;
  ports: MachinePort[];
};

export interface MachineDriver {
  readonly kind: string;
  /**
   * Whether the backend can suspend and later resume with the filesystem
   * intact. Modal sandboxes cannot: stopping one destroys it. The store refuses
   * to suspend when this is false rather than silently losing a user's work.
   */
  readonly supportsSuspend: boolean;
  create(input: CreateInput): Promise<CreateResult>;
  stop(handle: string): Promise<void>;
  suspend(handle: string): Promise<void>;
  resume(handle: string): Promise<void>;
  exec(handle: string, input: ExecInput): Promise<ExecResult>;
  putFile(handle: string, path: string, body: Uint8Array): Promise<void>;
  getFile(handle: string, path: string): Promise<Uint8Array | null>;
}

/** Thrown when a driver cannot service a request. Maps to 502 at the route. */
export class DriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriverError";
  }
}

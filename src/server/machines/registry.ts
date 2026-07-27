import { DriverError, type MachineDriver } from "./driver";
import { mockDriver } from "./mock-driver";
import { modalDriver } from "./modal-driver";

/**
 * Which backend NEW machines are provisioned on. Existing machines always use
 * the driver recorded on their row, so flipping this never orphans them.
 *
 * Read at call time, not module load: tests pin it to "mock", and a constant
 * evaluated at import would capture whatever `.env` happened to say.
 */
export function defaultDriverKind(): string {
  return process.env.ATLAS_MACHINE_DRIVER ?? "mock";
}

const drivers: Record<string, MachineDriver> = {
  mock: mockDriver,
  modal: modalDriver,
};

export function getDriver(kind: string): MachineDriver {
  const driver = drivers[kind];
  if (!driver) throw new DriverError(`Unknown machine driver "${kind}"`);
  return driver;
}

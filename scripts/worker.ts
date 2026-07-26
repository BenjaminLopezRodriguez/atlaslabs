/**
 * Atlas run worker — claims queued runs and executes them.
 * Run with: pnpm worker   (node --env-file=.env --import tsx scripts/worker.ts)
 * Scales horizontally: claiming uses FOR UPDATE SKIP LOCKED.
 */
import { workerTick } from "@/server/runs";

const IDLE_MS = 1500;
let stopping = false;

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function loop() {
  console.log("[worker] started");
  while (!stopping) {
    try {
      const worked = await workerTick();
      if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
    } catch (err) {
      console.error("[worker] tick failed", err);
      await new Promise((r) => setTimeout(r, IDLE_MS));
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
}

void loop();

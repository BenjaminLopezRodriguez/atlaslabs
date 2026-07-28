import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, afterEach } from "node:test";

process.env.ATLAS_MACHINE_DRIVER = "mock";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { machines, users, workspaces } from "@/server/db/schema";
import { createMachine, getMachineFile } from "@/server/machines/store";
import { runSpaceAgent } from "@/server/spaces/agent";
import { applyEdit, rejectEdit } from "@/server/spaces/edits";

const owner = `user_agent_${randomUUID().slice(0, 8)}`;
const realFetch = globalThis.fetch;
const realKey = process.env.ANTHROPIC_API_KEY;
const realDeepseekKey = process.env.DEEPSEEK_API_KEY;

void afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
  if (realDeepseekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = realDeepseekKey;
});

void after(async () => {
  const ws = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, owner),
  });
  const ids = ws.map((w) => w.id);
  if (ids.length) {
    await db.delete(machines).where(inArray(machines.workspaceId, ids));
  }
  await db.delete(workspaces).where(eq(workspaces.userId, owner));
  await db.delete(users).where(inArray(users.id, [owner]));
  process.exit(0);
});

async function seedMachine() {
  await db
    .insert(users)
    .values({ id: owner, email: `${owner}@test.local` })
    .onConflictDoNothing();
  return createMachine({
    userId: owner,
    slug: `agent-${randomUUID().slice(0, 6)}`,
  });
}

type Block = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

/**
 * Render content blocks as the Anthropic SSE stream that produces them. Tests
 * still describe a turn as its finished blocks; the gateway only speaks
 * streaming now, so the translation lives here rather than in every case.
 */
function asSse(turn: { content: unknown[]; stop_reason: string }) {
  const events: unknown[] = [];
  (turn.content as Block[]).forEach((b, index) => {
    if (b.type === "text") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "text" },
      });
      events.push({
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: b.text ?? "" },
      });
    } else if (b.type === "tool_use") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id: b.id, name: b.name },
      });
      events.push({
        type: "content_block_delta",
        index,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(b.input ?? {}),
        },
      });
    }
  });
  events.push({
    type: "message_delta",
    delta: { stop_reason: turn.stop_reason },
  });
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/** Queue of Anthropic responses, returned one per turn. */
function stubModel(turns: { content: unknown[]; stop_reason: string }[]) {
  // These assert the Anthropic wire shape, so pin the fallback provider even
  // when a real DeepSeek key is present in the environment.
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  const seen: unknown[] = [];
  let i = 0;
  globalThis.fetch = ((_url: string, init: { body: string }) => {
    seen.push(JSON.parse(init.body));
    const turn = turns[Math.min(i++, turns.length - 1)]!;
    return Promise.resolve(new Response(asSse(turn), { status: 200 }));
  }) as unknown as typeof fetch;
  return { requests: seen, count: () => i };
}

const text = (t: string) => ({ type: "text", text: t });
const toolUse = (name: string, input: Record<string, unknown>) => ({
  type: "tool_use",
  id: `tu_${randomUUID().slice(0, 8)}`,
  name,
  input,
});

void test("a write_file tool call is proposed for review, not applied", async () => {
  const machine = await seedMachine();
  stubModel([
    {
      content: [toolUse("write_file", { path: "app.js", content: "console.log(1)" })],
      stop_reason: "tool_use",
    },
    { content: [text("Proposed app.js.")], stop_reason: "end_turn" },
  ]);

  const res = await runSpaceAgent({
    machine,
    prompt: "create app.js",
    userId: owner,
  });

  assert.equal(res.text, "Proposed app.js.");
  assert.deepEqual(
    res.steps.map((s) => [s.tool, s.ok]),
    [["write_file", true]],
  );

  // The point of review: nothing reached the machine yet.
  assert.equal(res.edits.length, 1);
  assert.equal(res.edits[0]!.status, "pending");
  assert.equal(await getMachineFile(machine, "app.js"), null);

  // Accepting is what writes it.
  await applyEdit(res.edits[0]!, machine);
  const bytes = await getMachineFile(machine, "app.js");
  assert.equal(Buffer.from(bytes!).toString("utf8"), "console.log(1)");
});

void test("a rejected edit never touches the machine", async () => {
  const machine = await seedMachine();
  stubModel([
    {
      content: [toolUse("write_file", { path: "no.js", content: "boom" })],
      stop_reason: "tool_use",
    },
    { content: [text("Proposed no.js.")], stop_reason: "end_turn" },
  ]);

  const res = await runSpaceAgent({ machine, prompt: "x", userId: owner });
  const rejected = await rejectEdit(res.edits[0]!);

  assert.equal(rejected.status, "rejected");
  assert.equal(await getMachineFile(machine, "no.js"), null);
});

void test("set_plan and complete_step record the checklist", async () => {
  const machine = await seedMachine();
  stubModel([
    {
      content: [toolUse("set_plan", { steps: ["look", "edit"] })],
      stop_reason: "tool_use",
    },
    { content: [toolUse("complete_step", { step: 1 })], stop_reason: "tool_use" },
    { content: [text("Done.")], stop_reason: "end_turn" },
  ]);

  const res = await runSpaceAgent({ machine, prompt: "x", userId: owner });

  assert.deepEqual(
    res.plan.map((s) => [s.title, s.status]),
    [
      ["look", "done"],
      ["edit", "pending"],
    ],
  );
});

void test("a failing tool is reported back instead of throwing", async () => {
  const machine = await seedMachine();
  stubModel([
    { content: [toolUse("read_file", { path: "nope.txt" })], stop_reason: "tool_use" },
    { content: [text("That file does not exist.")], stop_reason: "end_turn" },
  ]);

  const res = await runSpaceAgent({
    machine,
    prompt: "read nope.txt",
    userId: owner,
  });

  assert.equal(res.steps[0]?.ok, false);
  assert.equal(res.truncated, false);
  assert.equal(res.text, "That file does not exist.");
});

void test("the loop stops rather than spinning forever", async () => {
  const machine = await seedMachine();
  // A model that only ever calls tools would loop until the cap.
  const stub = stubModel([
    { content: [toolUse("run_command", { command: "true" })], stop_reason: "tool_use" },
  ]);

  const res = await runSpaceAgent({
    machine,
    prompt: "loop forever",
    userId: owner,
  });

  assert.equal(res.truncated, true);
  assert.equal(stub.count(), 12);
  assert.match(res.text, /Stopped after 12 steps/);
});

void test("an unwritable oversize file is refused, not truncated", async () => {
  const machine = await seedMachine();
  stubModel([
    {
      content: [
        toolUse("write_file", { path: "big.txt", content: "x".repeat(600 * 1024) }),
      ],
      stop_reason: "tool_use",
    },
    { content: [text("Too big.")], stop_reason: "end_turn" },
  ]);

  const res = await runSpaceAgent({ machine, prompt: "write big", userId: owner });
  assert.equal(res.steps[0]?.ok, false);
  assert.equal(await getMachineFile(machine, "big.txt"), null);
});

void test("with no API key it degrades to the stub instead of failing", async () => {
  const machine = await seedMachine();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const res = await runSpaceAgent({ machine, prompt: "do a thing", userId: owner });
  assert.equal(res.steps.length, 0);
  assert.match(res.text, /stub model/);
});

void test("progress is reported per tool call, not only at the end", async () => {
  const machine = await seedMachine();
  stubModel([
    {
      content: [toolUse("write_file", { path: "a.js", content: "1" })],
      stop_reason: "tool_use",
    },
    {
      content: [toolUse("write_file", { path: "b.js", content: "2" })],
      stop_reason: "tool_use",
    },
    { content: [text("Done.")], stop_reason: "end_turn" },
  ]);

  const seen: { phase: string; detail?: string }[] = [];
  const res = await runSpaceAgent({
    machine,
    prompt: "create two files",
    userId: owner,
    onProgress: (p) => {
      seen.push(p);
    },
  });

  // Reported as the work happened, so a blocking turn is legible while it runs.
  assert.equal(seen.length, 2);
  assert.deepEqual(
    seen.map((p) => p.phase),
    ["write_file", "write_file"],
  );
  assert.ok(seen[0]!.detail, "each step carries a human-readable summary");
  assert.equal(res.steps.length, 2);
});

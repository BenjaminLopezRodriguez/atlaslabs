import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

process.env.ATLAS_MACHINE_DRIVER = "mock";

import { generateWithTools, type Turn } from "@/server/model/gateway";

const realFetch = globalThis.fetch;
const realAnthropic = process.env.ANTHROPIC_API_KEY;
const realDeepseek = process.env.DEEPSEEK_API_KEY;

void afterEach(() => {
  globalThis.fetch = realFetch;
  if (realAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realAnthropic;
  if (realDeepseek === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = realDeepseek;
});

type Captured = { url: string; body: Record<string, unknown> };

/** Capture the outgoing request and reply with one OpenAI-shaped choice. */
function stubDeepseek(message: {
  content: string | null;
  tool_calls?: unknown[];
  finish_reason?: string;
}) {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const seen: Captured[] = [];
  globalThis.fetch = ((url: string, init: { body: string }) => {
    seen.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: message.content,
                tool_calls: message.tool_calls,
              },
              finish_reason: message.finish_reason ?? "stop",
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;
  return seen;
}

const TOOLS = [
  {
    name: "write_file",
    description: "Write a file",
    input_schema: { type: "object", properties: { path: { type: "string" } } },
  },
];

void test("deepseek is the default coding provider when its key is set", async () => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  const seen = stubDeepseek({ content: "done" });

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.model, "deepseek-v4-flash");
  assert.equal(turn.stub, false);
  assert.match(seen[0]!.url, /api\.deepseek\.com/);
  assert.equal(seen[0]!.body.model, "deepseek-v4-flash");
});

void test("without a deepseek key it falls back to anthropic, not the stub", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  const seen: string[] = [];
  globalThis.fetch = ((url: string) => {
    seen.push(url);
    return Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.model, "claude-opus-5");
  assert.match(seen[0]!, /api\.anthropic\.com/);
});

void test("with no provider key at all it degrades to the stub", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.stub, true);
  assert.deepEqual(turn.calls, []);
});

void test("tools are sent in openai function shape", async () => {
  const seen = stubDeepseek({ content: "ok" });

  await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.deepEqual(seen[0]!.body.tools, [
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write a file",
        parameters: TOOLS[0]!.input_schema,
      },
    },
  ]);
});

void test("a tool call comes back as anthropic blocks the agent loop can echo", async () => {
  stubDeepseek({
    content: null,
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "a.ts" }),
        },
      },
    ],
    finish_reason: "tool_calls",
  });

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.stopReason, "tool_use");
  assert.deepEqual(turn.calls, [
    { id: "call_1", name: "write_file", input: { path: "a.ts" } },
  ]);
  assert.deepEqual(turn.raw, [
    { type: "tool_use", id: "call_1", name: "write_file", input: { path: "a.ts" } },
  ]);
});

void test("history round-trips: echoed blocks translate back to openai messages", async () => {
  const seen = stubDeepseek({ content: "finished" });

  // Exactly what agent.ts pushes after running a tool.
  const messages: Turn[] = [
    { role: "user", content: "make a file" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "working" },
        { type: "tool_use", id: "call_1", name: "write_file", input: { path: "a.ts" } },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call_1",
          content: "wrote a.ts",
          is_error: false,
        },
      ],
    },
  ];

  await generateWithTools({ system: "sys", messages, tools: TOOLS });

  assert.deepEqual(seen[0]!.body.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "make a file" },
    {
      role: "assistant",
      content: "working",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "write_file", arguments: '{"path":"a.ts"}' },
        },
      ],
    },
    { role: "tool", tool_call_id: "call_1", content: "wrote a.ts" },
  ]);
});

void test("a failed tool is marked so the model can see it failed", async () => {
  const seen = stubDeepseek({ content: "ok" });

  await generateWithTools({
    system: "sys",
    messages: [
      { role: "user", content: "go" },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_9",
            content: "no such path",
            is_error: true,
          },
        ],
      },
    ],
    tools: TOOLS,
  });

  const msgs = seen[0]!.body.messages as { role: string; content: string }[];
  assert.equal(msgs.at(-1)!.role, "tool");
  assert.match(msgs.at(-1)!.content, /^ERROR: no such path/);
});

void test("malformed tool arguments do not blow up the turn", async () => {
  stubDeepseek({
    content: null,
    tool_calls: [
      {
        id: "call_2",
        type: "function",
        function: { name: "write_file", arguments: "{not json" },
      },
    ],
    finish_reason: "tool_calls",
  });

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.deepEqual(turn.calls, [
    { id: "call_2", name: "write_file", input: {} },
  ]);
});

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

/** An SSE body, built the way a provider frames it: one blank line per event. */
function sse(events: unknown[], done?: string) {
  return (
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
    (done ? `data: ${done}\n\n` : "")
  );
}

/**
 * Capture the outgoing request and reply with an OpenAI-shaped SSE stream.
 * `chunks` are `choices[0]` deltas, sent one frame each.
 */
function stubDeepseek(
  chunks: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[],
) {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const seen: Captured[] = [];
  globalThis.fetch = ((url: string, init: { body: string }) => {
    seen.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return Promise.resolve(
      new Response(
        sse(
          chunks.map((c) => ({ choices: [c] })),
          "[DONE]",
        ),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;
  return seen;
}

/** The common case: one text-only reply, streamed as a single chunk. */
function stubDeepseekText(text: string) {
  return stubDeepseek([{ delta: { content: text }, finish_reason: "stop" }]);
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
  const seen = stubDeepseekText("done");

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
        [
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "ok" },
          },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]
          .map((e) => `data: ${JSON.stringify(e)}\n\n`)
          .join(""),
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
  const seen = stubDeepseekText("ok");

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
  // Fragmented the way a real stream sends it: name first, arguments split.
  stubDeepseek([
    {
      delta: {
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "write_file" } },
        ],
      },
    },
    { delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } },
    { delta: { tool_calls: [{ index: 0, function: { arguments: '"a.ts"}' } }] } },
    { finish_reason: "tool_calls" },
  ]);

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
  const seen = stubDeepseekText("finished");

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
  const seen = stubDeepseekText("ok");

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
  stubDeepseek([
    {
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "call_2",
            function: { name: "write_file", arguments: "{not json" },
          },
        ],
      },
    },
    { finish_reason: "tool_calls" },
  ]);

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.deepEqual(turn.calls, [
    { id: "call_2", name: "write_file", input: {} },
  ]);
});

void test("text is streamed to onDelta in order, as it arrives", async () => {
  stubDeepseek([
    { delta: { content: "Hel" } },
    { delta: { content: "lo " } },
    { delta: { content: "world" }, finish_reason: "stop" },
  ]);

  const chunks: string[] = [];
  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
    onDelta: (c) => chunks.push(c),
  });

  assert.deepEqual(chunks, ["Hel", "lo ", "world"]);
  // The assembled text must equal the concatenated deltas, or a streamed
  // reply would visibly change when it finalizes.
  assert.equal(turn.text, "Hello world");
  assert.equal(turn.text, chunks.join(""));
});

void test("anthropic streams deltas too, so the fallback is not silent", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        sse([
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "one " } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "two" } },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]),
        { status: 200 },
      ),
    ));

  const chunks: string[] = [];
  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
    onDelta: (c) => chunks.push(c),
  });

  assert.deepEqual(chunks, ["one ", "two"]);
  assert.equal(turn.text, "one two");
});

void test("anthropic tool_use arrives as split json and reassembles", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        sse([
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "tu_1", name: "write_file" },
          },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"pa' } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'th":"b.ts"}' } },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
        ]),
        { status: 200 },
      ),
    ));

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.stopReason, "tool_use");
  assert.deepEqual(turn.calls, [
    { id: "tu_1", name: "write_file", input: { path: "b.ts" } },
  ]);
});

void test("an sse frame split across network reads is not parsed early", async () => {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const frames = sse(
    [{ choices: [{ delta: { content: "split" }, finish_reason: "stop" }] }],
    "[DONE]",
  );
  const encoder = new TextEncoder();
  // Deliver one byte at a time: the worst case a real socket can produce.
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of encoder.encode(frames)) {
              controller.enqueue(new Uint8Array([byte]));
            }
            controller.close();
          },
        }),
        { status: 200 },
      ),
    ));

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  assert.equal(turn.text, "split");
});

void test("a mid-stream error event fails the turn instead of truncating it", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        sse([
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } },
          { type: "error", error: { message: "overloaded" } },
        ]),
        { status: 200 },
      ),
    ));

  await assert.rejects(
    generateWithTools({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: TOOLS,
    }),
    /overloaded/,
  );
});

void test("thinking blocks survive so anthropic accepts the next tool turn", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        sse([
          { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
          { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "let me " } },
          { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "check" } },
          { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } },
          { type: "content_block_start", index: 1, content_block: { type: "text" } },
          { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "reading now" } },
          {
            type: "content_block_start",
            index: 2,
            content_block: { type: "tool_use", id: "tu_9", name: "write_file" },
          },
          { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"path":"c.ts"}' } },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
        ]),
        { status: 200 },
      ),
    ));

  const turn = await generateWithTools({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });

  // Order matters as much as presence: Anthropic rejects history where the
  // thinking block is missing or no longer leads the turn.
  assert.deepEqual(turn.raw, [
    { type: "thinking", thinking: "let me check", signature: "sig-abc" },
    { type: "text", text: "reading now" },
    { type: "tool_use", id: "tu_9", name: "write_file", input: { path: "c.ts" } },
  ]);
  assert.equal(turn.text, "reading now");
});

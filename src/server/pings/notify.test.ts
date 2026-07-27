import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

process.env.ANTHROPIC_API_KEY = "";

import { getNotifier, isEmailConfigured } from "@/server/pings/notify";

const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API_KEY;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = realKey;
  delete process.env.ATLAS_PING_FROM;
});

const input = {
  to: "someone@example.com",
  question: "Postgres or SQLite?",
  replyUrl: "https://www.atlaslabs.id/ping/atlas_ping_abc",
  machineSlug: "my-app",
  context: "architecture",
};

void test("falls back to link-only when no key is configured", async () => {
  delete process.env.RESEND_API_KEY;
  const n = getNotifier();
  assert.equal(n.channel, "link");
  assert.equal(isEmailConfigured(), false);

  const res = await n.send(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /no notification transport/);
});

void test("sends through Resend when configured", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  let captured: { url: string; body: Record<string, unknown>; auth: string } | null =
    null;

  globalThis.fetch = ((url: string, init: RequestInit) => {
    captured = {
      url: String(url),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      auth: String((init.headers as Record<string, string>).authorization),
    };
    return Promise.resolve(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  const n = getNotifier();
  assert.equal(n.channel, "email");
  const res = await n.send(input);

  assert.equal(res.delivered, true);
  assert.equal(captured!.url, "https://api.resend.com/emails");
  assert.equal(captured!.auth, "Bearer re_test_key");
  assert.deepEqual(captured!.body.to, ["someone@example.com"]);
  // both parts carry the reply link — some clients strip HTML
  assert.match(String(captured!.body.text), /atlas_ping_abc/);
  assert.match(String(captured!.body.html), /atlas_ping_abc/);
  assert.match(String(captured!.body.subject), /my-app/);
});

void test("a provider error degrades instead of throwing", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "domain not verified" }), {
        status: 403,
      }),
    )) as unknown as typeof fetch;

  const res = await getNotifier().send(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /resend 403/);
  assert.match(res.error ?? "", /domain not verified/);
  // the key must never appear in an error that gets stored or logged
  assert.doesNotMatch(res.error ?? "", /re_test_key/);
});

void test("a network failure degrades instead of throwing", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (() =>
    Promise.reject(new Error("connect ECONNREFUSED"))) as unknown as typeof fetch;

  const res = await getNotifier().send(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /ECONNREFUSED/);
});

void test("the question is escaped into the HTML body", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  let html = "";
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    html = String(
      (JSON.parse(String(init.body)) as Record<string, unknown>).html,
    );
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;

  await getNotifier().send({
    ...input,
    question: `<img src=x onerror="alert(1)"> & "quoted"`,
  });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&amp;/);
});

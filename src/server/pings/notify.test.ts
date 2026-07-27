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

/** What the notifier actually sends. It always sends a JSON string body. */
type SentRequest = {
  url: string;
  auth: string;
  body: Record<string, unknown>;
};

/**
 * Replace fetch with a stub and record what the notifier sent.
 *
 * The cast is confined here so call sites stay plain. Defaults are definite
 * rather than null so the assertions need no narrowing.
 */
function stubFetch(respond: () => Promise<Response>): { last: SentRequest } {
  const sent: SentRequest = { url: "", auth: "", body: {} };
  const stub = (url: string, init: { body: string; headers: Record<string, string> }) => {
    sent.url = url;
    sent.auth = init.headers.authorization ?? "";
    sent.body = JSON.parse(init.body) as Record<string, unknown>;
    return respond();
  };
  globalThis.fetch = stub as unknown as typeof fetch;
  return { last: sent };
}

const ok = (payload: unknown = { id: "email_1" }) =>
  Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));

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
  const captured = stubFetch(() => ok());

  const n = getNotifier();
  assert.equal(n.channel, "email");
  const res = await n.send(input);

  assert.equal(res.delivered, true);
  assert.equal(captured.last.url, "https://api.resend.com/emails");
  assert.equal(captured.last.auth, "Bearer re_test_key");
  assert.deepEqual(captured.last.body.to, ["someone@example.com"]);
  // both parts carry the reply link — some clients strip HTML
  assert.match(String(captured.last.body.text), /atlas_ping_abc/);
  assert.match(String(captured.last.body.html), /atlas_ping_abc/);
  assert.match(String(captured.last.body.subject), /my-app/);
});

void test("a provider error degrades instead of throwing", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "domain not verified" }), {
        status: 403,
      }),
    ),
  );

  const res = await getNotifier().send(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /resend 403/);
  assert.match(res.error ?? "", /domain not verified/);
  // the key must never appear in an error that gets stored or logged
  assert.doesNotMatch(res.error ?? "", /re_test_key/);
});

void test("a network failure degrades instead of throwing", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  stubFetch(() => Promise.reject(new Error("connect ECONNREFUSED")));

  const res = await getNotifier().send(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /ECONNREFUSED/);
});

void test("the question is escaped into the HTML body", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  const captured = stubFetch(() => ok({}));

  await getNotifier().send({
    ...input,
    question: `<img src=x onerror="alert(1)"> & "quoted"`,
  });

  const html = String(captured.last.body.html);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&amp;/);
});

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { acceptUrl, sendInviteEmail } from "@/server/invites/notify";

const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API_KEY;
const realAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = realKey;
  if (realAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = realAppUrl;
});

function stubFetch(): { body: Record<string, string> } {
  const sent: { body: Record<string, string> } = { body: {} };
  const stub = (_url: string, init: { body: string }) => {
    sent.body = JSON.parse(init.body) as Record<string, string>;
    return Promise.resolve(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
  };
  globalThis.fetch = stub as unknown as typeof fetch;
  return sent;
}

const input = {
  to: "new@example.com",
  token: "atlas_inv_abc",
  groupName: "Atlas Labs",
  groupSlug: "atlas-labs",
  role: "operator",
  invitedBy: "ben@example.com",
  machine: { slug: "my-app", id: "mch_123" },
};

void test("an unconfigured transport leaves the invite shareable by link", async () => {
  delete process.env.RESEND_API_KEY;
  const res = await sendInviteEmail(input);
  assert.equal(res.delivered, false);
  assert.match(res.error ?? "", /RESEND_API_KEY/);
});

void test("the invite carries the machine id and the commands that follow it", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.atlaslabs.id";
  const sent = stubFetch();

  const res = await sendInviteEmail(input);
  assert.equal(res.delivered, true);

  const { subject, text, html } = sent.body;
  assert.match(subject!, /my-app/);
  for (const body of [text!, html!]) {
    assert.ok(body.includes("mch_123"), "machine id is in the body");
    assert.ok(body.includes("atlas login"));
    assert.ok(body.includes("atlas group use atlas-labs"));
    assert.ok(
      body.includes("https://www.atlaslabs.id/invite?token=atlas_inv_abc"),
      "accept link is in the body",
    );
  }
});

void test("a group name is escaped into the HTML body", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  const sent = stubFetch();

  await sendInviteEmail({ ...input, groupName: "<script>x</script>" });
  assert.ok(!sent.body.html!.includes("<script>"));
  assert.ok(sent.body.html!.includes("&lt;script&gt;"));
});

void test("acceptUrl encodes the token", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://www.atlaslabs.id/";
  // trailing slash on the origin must not double up
  assert.equal(
    acceptUrl("a b"),
    "https://www.atlaslabs.id/invite?token=a%20b",
  );
});

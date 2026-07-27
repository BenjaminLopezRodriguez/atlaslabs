import assert from "node:assert/strict";
import test from "node:test";

import { isSafeHttpUrl, safeHttpUrl } from "./url";

void test("script-bearing schemes are refused", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]) {
    assert.equal(isSafeHttpUrl(bad), false, `accepted: ${bad}`);
  }
});

void test("these are all valid URLs, which is exactly the problem", () => {
  // Documents why `z.string().url()` was not enough on its own.
  assert.doesNotThrow(() => new URL("javascript:alert(1)"));
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
});

void test("http and https pass", () => {
  assert.ok(isSafeHttpUrl("https://app.up.railway.app"));
  assert.ok(isSafeHttpUrl("http://localhost:3000/path?q=1#x"));
});

void test("nothing is not a URL", () => {
  for (const empty of [null, undefined, "", "not a url", "//evil.test"]) {
    assert.equal(isSafeHttpUrl(empty), false, `accepted: ${String(empty)}`);
  }
});

void test("safeHttpUrl returns the value or null", () => {
  assert.equal(safeHttpUrl("https://x.dev"), "https://x.dev");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
});

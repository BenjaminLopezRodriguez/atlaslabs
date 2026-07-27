import assert from "node:assert/strict";
import test from "node:test";

import { assertSlug, isValidSlug } from "@/server/machines/slug";

void test("accepts DNS-label slugs", () => {
  for (const ok of [
    "my-app",
    "a",
    "a1",
    "1a",
    "atlas-browser-demo",
    "a".repeat(63),
  ]) {
    assert.equal(isValidSlug(ok), true, ok);
  }
});

void test("rejects everything that is not a DNS label", () => {
  for (const bad of [
    "",
    "a".repeat(64),
    "My-App",
    "-leading",
    "trailing-",
    "under_score",
    "has space",
    "dot.dot",
    "..",
    "../../etc/passwd",
    "%2e%2e",
    "slug/with/slash",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isValidSlug(bad), false, JSON.stringify(bad));
  }
});

void test("assertSlug throws with a usable message", () => {
  assert.equal(assertSlug("my-app"), "my-app");
  assert.throws(() => assertSlug("../etc"), /Invalid machine slug/);
});

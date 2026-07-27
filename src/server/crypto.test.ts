import assert from "node:assert/strict";
import test from "node:test";

process.env.ATLAS_ENCRYPTION_KEY ??= "test-key-that-is-long-enough-000000";

const { encryptSecret, decryptSecret } = await import("./crypto");

void test("a token survives a round trip", () => {
  const token = "ghp_" + "a".repeat(36);
  assert.equal(decryptSecret(encryptSecret(token)), token);
});

void test("the ciphertext does not contain the token", () => {
  const token = "railway-project-token";
  assert.ok(!encryptSecret(token).includes(token));
});

void test("each encryption uses a fresh iv", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

void test("a tampered blob is rejected rather than silently decrypted", () => {
  const blob = encryptSecret("secret");
  const [v, iv, tag, body] = blob.split(".");
  const flipped = [v, iv, tag, (body!.startsWith("A") ? "B" : "A") + body!.slice(1)].join(".");
  assert.throws(() => decryptSecret(flipped));
});

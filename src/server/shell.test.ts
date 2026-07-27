import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { assertRelativeDir, shellArgs, shellQuote } from "./shell";

/** What the shell actually does with the quoted string — the only real check. */
const echo = (quoted: string) =>
  execFileSync("/bin/sh", ["-c", `printf %s ${quoted}`], { encoding: "utf8" });

void test("command substitution does not execute", () => {
  for (const payload of [
    "a$(id)",
    "a`id`",
    "$(rm -rf /)",
    "${HOME}",
    "a\\$(id)",
  ]) {
    assert.equal(echo(shellQuote(payload)), payload, `escaped: ${payload}`);
  }
});

void test("quotes and shell metacharacters survive verbatim", () => {
  for (const payload of [
    "it's",
    `say "hi"`,
    "a; rm -rf /",
    "a | b",
    "a && b",
    "a\nb",
    "*",
    "~",
  ]) {
    assert.equal(echo(shellQuote(payload)), payload, `escaped: ${payload}`);
  }
});

void test("JSON.stringify is not a shell quoter — the reason this module exists", () => {
  // Documents the bug this replaced: double quotes leave $() live.
  assert.notEqual(echo(JSON.stringify("a$(printf b)")), "a$(printf b)");
  assert.equal(echo(shellQuote("a$(printf b)")), "a$(printf b)");
});

void test("shellArgs quotes every argument", () => {
  assert.equal(shellArgs(["a b", "c'd"]), `'a b' 'c'\\''d'`);
});

void test("assertRelativeDir rejects traversal and absolute paths", () => {
  assert.equal(assertRelativeDir("apps/web"), "apps/web");
  assert.equal(assertRelativeDir("./apps/web/"), "apps/web");
  assert.equal(assertRelativeDir(""), null);

  for (const bad of ["/etc", "../x", "a/../../b", "a//b", "a/./b", "a\0b"]) {
    assert.throws(
      () => assertRelativeDir(bad),
      /Invalid directory/,
      `allowed: ${bad}`,
    );
  }
});

void test("a stripping sanitizer would have reassembled this; rejecting does not", () => {
  // "....//" with `..` removed becomes "../" — the exact reason this throws.
  assert.throws(() => assertRelativeDir("....//x"));
});

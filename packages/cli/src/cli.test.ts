import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { collectFiles, globToRegExp, isSecretPath } from "./cli.js";

void test("globToRegExp", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
  assert.ok(globToRegExp("**").test("anything/here.txt"));
  assert.ok(globToRegExp(".env*").test(".env.local"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  assert.ok(globToRegExp("docs/*.md").test("docs/x.md"));
});

void test("isSecretPath", () => {
  assert.ok(isSecretPath(".env"));
  assert.ok(isSecretPath("config/.env.production"));
  assert.ok(isSecretPath("keys/server.pem"));
  assert.ok(isSecretPath(".ssh/id_rsa"));
  assert.ok(isSecretPath("secrets.yaml"));
  assert.ok(!isSecretPath("src/index.ts"));
});

void test("collectFiles rejects secrets and binaries, honors globs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-cli-test-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src/app.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
  fs.writeFileSync(
    path.join(dir, "src/key.ts"),
    "const k = 'AKIAABCDEFGHIJKLMNOP';\n",
  );
  fs.writeFileSync(path.join(dir, "src/blob.bin"), Buffer.from([0, 1, 2]));
  fs.writeFileSync(path.join(dir, "README.md"), "# hi\n");

  const { files, skipped } = collectFiles(dir, ["src/**", "README.md"], []);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["README.md", "src/app.ts"]);
  assert.ok(skipped.some((s) => s.path === "src/key.ts"));
  assert.ok(skipped.some((s) => s.path === "src/blob.bin"));
  fs.rmSync(dir, { recursive: true, force: true });
});

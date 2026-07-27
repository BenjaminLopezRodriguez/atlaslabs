import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  collectFiles,
  globToRegExp,
  isSecretPath,
  parseExecArgs,
  parseInviteArgs,
  parsePingQuestion,
  remotePath,
} from "./cli.js";

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

void test("parseExecArgs passes the remote command through verbatim", () => {
  assert.deepEqual(parseExecArgs(["--", "echo", "hi"]), ["echo", "hi"]);
  // flags after `--` belong to the remote command, not to atlas
  assert.deepEqual(parseExecArgs(["--", "ls", "-la", "--color"]), [
    "ls",
    "-la",
    "--color",
  ]);
  // only the first `--` separates; later ones are part of the command
  assert.deepEqual(parseExecArgs(["--", "git", "log", "--", "path"]), [
    "git",
    "log",
    "--",
    "path",
  ]);
  // no separator: the whole tail is the command
  assert.deepEqual(parseExecArgs(["pnpm", "build"]), ["pnpm", "build"]);
  assert.deepEqual(parseExecArgs([]), []);
  assert.deepEqual(parseExecArgs(["--"]), []);
});

void test("remotePath keeps workspace-relative semantics", () => {
  assert.equal(remotePath("src/app.ts"), "src/app.ts");
  // the /workspace prefix users see in `exec` output is accepted
  assert.equal(remotePath("/workspace/src/app.ts"), "src/app.ts");
  assert.equal(remotePath("/workspace"), "");
  // a directory literally named workspace is not the workdir prefix
  assert.equal(remotePath("workspace/app.ts"), "workspace/app.ts");
});

void test("parsePingQuestion keeps the question when flags are absent", () => {
  // the regression: an absent flag made indexOf return -1, and the
  // "flag + 1" check then matched index 0 and ate the question
  assert.equal(parsePingQuestion(["Deploy tonight?"]), "Deploy tonight?");
  assert.equal(parsePingQuestion(["Deploy tonight?", "--no-wait"]), "Deploy tonight?");
  assert.equal(
    parsePingQuestion(["Deploy", "tonight?", "--timeout", "60"]),
    "Deploy tonight?",
  );
  assert.equal(
    parsePingQuestion(["Pick", "one", "--context", "arch", "--timeout", "60"]),
    "Pick one",
  );
  assert.equal(parsePingQuestion([]), "");
});

void test("parseInviteArgs", () => {
  assert.deepEqual(parseInviteArgs([]), {
    role: "operator",
    machineSlug: undefined,
  });
  // the old positional form still works
  assert.deepEqual(parseInviteArgs(["builder"]), {
    role: "builder",
    machineSlug: undefined,
  });
  assert.deepEqual(parseInviteArgs(["--role", "owner", "--machine", "api"]), {
    role: "owner",
    machineSlug: "api",
  });
  // a flag must not swallow the next flag as its value
  assert.deepEqual(parseInviteArgs(["--machine", "--role", "owner"]), {
    error: "--machine needs a value.",
  });
  assert.deepEqual(parseInviteArgs(["--role"]), {
    error: "--role needs a value.",
  });
});

#!/usr/bin/env node
/**
 * Atlas CLI — connect local work to Atlas specialist workspaces.
 *
 * Zero runtime dependencies except `yaml` (atlas.yaml). Auth token is kept in
 * the macOS keychain when available, else a 0600 file in the Atlas config
 * dir. Never written into project files.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const DEFAULT_BASE = process.env.ATLAS_BASE_URL ?? "http://localhost:3000";

/* ----------------------------- config ------------------------------ */

function configDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "atlas");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg ?? path.join(os.homedir(), ".config"), "atlas");
}

type Config = {
  baseUrl?: string;
  currentGroup?: string; // group slug
};

function readConfig(): Config {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(configDir(), "config.json"), "utf8"),
    ) as Config;
  } catch {
    return {};
  }
}

function writeConfig(cfg: Config) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(
    path.join(configDir(), "config.json"),
    JSON.stringify(cfg, null, 2) + "\n",
    { mode: 0o600 },
  );
}

const KEYCHAIN_SERVICE = "id.atlaslabs.cli";

function saveToken(token: string) {
  if (process.platform === "darwin") {
    try {
      execFileSync(
        "security",
        [
          "add-generic-password",
          "-U",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          os.userInfo().username,
          "-w",
          token,
        ],
        { stdio: "ignore" },
      );
      return;
    } catch {
      /* fall through to file */
    }
  }
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(path.join(configDir(), "token"), token, { mode: 0o600 });
}

function loadToken(): string | null {
  if (process.platform === "darwin") {
    try {
      return execFileSync(
        "security",
        [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          os.userInfo().username,
          "-w",
        ],
        { encoding: "utf8" },
      ).trim();
    } catch {
      /* fall through */
    }
  }
  try {
    return fs.readFileSync(path.join(configDir(), "token"), "utf8").trim();
  } catch {
    return null;
  }
}

function deleteToken() {
  if (process.platform === "darwin") {
    try {
      execFileSync(
        "security",
        [
          "delete-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          os.userInfo().username,
        ],
        { stdio: "ignore" },
      );
    } catch {
      /* ignore */
    }
  }
  fs.rmSync(path.join(configDir(), "token"), { force: true });
}

function baseUrl(): string {
  return readConfig().baseUrl ?? DEFAULT_BASE;
}

/* ------------------------------- http ------------------------------- */

async function api(
  method: string,
  route: string,
  body?: unknown,
  opts: { auth?: boolean } = { auth: true },
): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.auth !== false) {
    const token = loadToken();
    if (!token) fail("Not logged in. Run `atlas login` first.");
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl()}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (res.status === 401) fail("Unauthorized — run `atlas login`.");
    const detail =
      json?.rejected
        ?.map(
          (r: { path: string; reason: string }) => `  ${r.path} — ${r.reason}`,
        )
        .join("\n") ?? "";
    fail(
      `${method} ${route} failed (${res.status}): ${json?.error ?? "error"}` +
        (json?.hint ? `\n${json.hint}` : "") +
        (detail ? `\n${detail}` : ""),
    );
  }
  return json;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* user can open manually */
  }
}

/* ---------------------------- atlas.yaml ---------------------------- */

type AtlasYaml = {
  version: number;
  group?: string;
  workspace?: string;
  specialist?: string;
  sources?: {
    path: string;
    include?: string[];
    exclude?: string[];
  }[];
  permissions?: { commands?: string[] };
};

const ATLAS_YAML = "atlas.yaml";

function readAtlasYaml(): AtlasYaml | null {
  try {
    return parseYaml(fs.readFileSync(ATLAS_YAML, "utf8")) as AtlasYaml;
  } catch {
    return null;
  }
}

/* ------------------------- glob + secret rules ----------------------- */

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if ("\\^$.|+()[]{}".includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

const DEFAULT_EXCLUDE = [
  ".env*",
  "node_modules/**",
  ".git/**",
  ".next/**",
  "dist/**",
  "build/**",
  "*.lock",
  "pnpm-lock.yaml",
];

// Mirrors the server's trust-boundary list (src/server/sources/secrets.ts).
const SECRET_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/,
  /(^|\/)(credentials|secrets?)\.(json|ya?ml|toml|ini)$/i,
  /(^|\/)\.(aws|ssh|gnupg|kube|docker)(\/|$)/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)serviceaccount.*\.json$/i,
];

const SECRET_CONTENT_PATTERNS: RegExp[] = [
  /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{36,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
];

export function isSecretPath(p: string): boolean {
  return SECRET_PATH_PATTERNS.some((re) => re.test(p));
}

const MAX_FILE_BYTES = 512 * 1024;

export type WalkResult = {
  files: { path: string; abs: string; bytes: number }[];
  skipped: { path: string; reason: string }[];
};

export function collectFiles(
  root: string,
  include: string[],
  exclude: string[],
): WalkResult {
  const inc = include.length ? include.map(globToRegExp) : [/^.*$/];
  const exc = [...exclude, ...DEFAULT_EXCLUDE].map(globToRegExp);
  const files: WalkResult["files"] = [];
  const skipped: WalkResult["skipped"] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (exc.some((re) => re.test(rel) || re.test(rel + "/"))) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!inc.some((re) => re.test(rel))) continue;
      if (isSecretPath(rel)) {
        skipped.push({ path: rel, reason: "secret path (default reject)" });
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.size > MAX_FILE_BYTES) {
        skipped.push({ path: rel, reason: "over 512KB" });
        continue;
      }
      const buf = fs.readFileSync(abs);
      if (buf.includes(0)) {
        skipped.push({ path: rel, reason: "binary" });
        continue;
      }
      if (SECRET_CONTENT_PATTERNS.some((re) => re.test(buf.toString("utf8")))) {
        skipped.push({ path: rel, reason: "likely secret content" });
        continue;
      }
      files.push({ path: rel, abs, bytes: stat.size });
    }
  };
  walk(root);
  return { files, skipped };
}

/* ----------------------------- resolvers ----------------------------- */

async function resolveWorkspace(): Promise<{ id: string; label: string }> {
  const yamlCfg = readAtlasYaml();
  const groupSlug = yamlCfg?.group ?? readConfig().currentGroup;
  const ws = await api("GET", "/api/v1/cli/workspaces");
  if (!groupSlug || groupSlug === "personal") {
    return { id: ws.personal.id, label: "personal" };
  }
  const found = ws.groupWorkspaces.find(
    (w: any) => w.group?.slug === groupSlug,
  );
  if (!found) {
    fail(
      `No workspace for group "${groupSlug}". Run \`atlas group list\` or \`atlas group use <slug>\`.`,
    );
  }
  return { id: found.id, label: found.group.name };
}

async function resolveGroupId(slug: string): Promise<string> {
  const { groups } = await api("GET", "/api/v1/cli/groups");
  const g = groups.find((x: any) => x.slug === slug || x.id === slug);
  if (!g) fail(`Unknown group "${slug}".`);
  return g.id;
}

/* ------------------------------ commands ----------------------------- */

async function cmdLogin() {
  const code = await api(
    "POST",
    "/api/v1/auth/device/code",
    {},
    { auth: false },
  );
  console.log(`\nYour code: ${code.user_code}`);
  console.log(`Approve at: ${code.verification_uri_complete}\n`);
  openBrowser(code.verification_uri_complete);

  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, code.interval * 1000));
    const res = await fetch(`${baseUrl()}/api/v1/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: code.device_code }),
    });
    const json = (await res.json()) as any;
    if (res.ok && json.access_token) {
      saveToken(json.access_token);
      const me = await api("GET", "/api/v1/cli/whoami");
      console.log(`Logged in as ${me.email}.`);
      return;
    }
    if (json.error === "authorization_pending") continue;
    fail(`Login failed: ${json.error}`);
  }
  fail("Login timed out.");
}

async function cmdLogout() {
  if (loadToken()) {
    await api("DELETE", "/api/v1/cli/token").catch(() => undefined);
  }
  deleteToken();
  console.log("Logged out.");
}

async function cmdWhoami() {
  const me = await api("GET", "/api/v1/cli/whoami");
  console.log(`${me.email}${me.name ? ` (${me.name})` : ""}`);
}

async function cmdGroup(sub: string | undefined, rest: string[]) {
  if (sub === "list" || !sub) {
    const { groups } = await api("GET", "/api/v1/cli/groups");
    const current = readConfig().currentGroup;
    if (groups.length === 0)
      console.log("No groups. `atlas group create <name>`.");
    for (const g of groups) {
      console.log(
        `${g.slug === current ? "*" : " "} ${g.slug}  (${g.name}, ${g.role})`,
      );
    }
    return;
  }
  if (sub === "create") {
    const name = rest.join(" ");
    if (!name) fail("Usage: atlas group create <name>");
    const { group } = await api("POST", "/api/v1/cli/groups", { name });
    writeConfig({ ...readConfig(), currentGroup: group.slug });
    console.log(`Created group ${group.slug} (now current).`);
    return;
  }
  if (sub === "use") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas group use <slug>");
    await resolveGroupId(slug);
    writeConfig({ ...readConfig(), currentGroup: slug });
    console.log(`Current group: ${slug}`);
    return;
  }
  fail("Usage: atlas group <list|create|use>");
}

async function cmdMember(sub: string | undefined, rest: string[]) {
  if (sub !== "invite") fail("Usage: atlas member invite <email> [role]");
  const email = rest[0];
  const role = (rest[1] ?? "operator") as string;
  const slug = readConfig().currentGroup ?? readAtlasYaml()?.group;
  if (!email)
    fail("Usage: atlas member invite <email> [owner|builder|operator|viewer]");
  if (!slug) fail("No current group. `atlas group use <slug>` first.");
  const groupId = await resolveGroupId(slug);
  const inv = await api("POST", "/api/v1/cli/invitations", {
    groupId,
    email,
    role,
  });
  console.log(
    `Invited ${email} as ${role}.\nAccept link (share manually): ${baseUrl()}/invite?token=${inv.token}`,
  );
}

function cmdInit() {
  if (fs.existsSync(ATLAS_YAML)) fail(`${ATLAS_YAML} already exists.`);
  const cfg: AtlasYaml = {
    version: 1,
    group: readConfig().currentGroup ?? "personal",
    specialist: "",
    sources: [
      {
        path: ".",
        include: ["src/**", "docs/**", "README.md"],
        exclude: [".env*", "node_modules/**", ".git/**"],
      },
    ],
    permissions: { commands: [] },
  };
  fs.writeFileSync(ATLAS_YAML, stringifyYaml(cfg));
  console.log(`Wrote ${ATLAS_YAML}. Edit sources, then \`atlas source sync\`.`);
}

async function cmdLink() {
  const yamlCfg = readAtlasYaml();
  if (!yamlCfg) fail(`No ${ATLAS_YAML}. Run \`atlas init\` first.`);
  const ws = await resolveWorkspace();
  console.log(`Linked to workspace: ${ws.label} (${ws.id})`);
  if (yamlCfg.specialist) {
    const { specialists } = await api(
      "GET",
      `/api/v1/cli/specialists?workspaceId=${ws.id}`,
    );
    const sp = specialists.find((s: any) => s.slug === yamlCfg.specialist);
    console.log(
      sp
        ? `Specialist: ${sp.name} (${sp.state})`
        : `Specialist "${yamlCfg.specialist}" not found in workspace.`,
    );
  }
}

async function cmdStatus() {
  const token = loadToken();
  console.log(`Server: ${baseUrl()}`);
  if (!token) {
    console.log("Auth: not logged in");
    return;
  }
  const me = await api("GET", "/api/v1/cli/whoami");
  console.log(`Auth: ${me.email}`);
  const cfg = readAtlasYaml();
  if (!cfg) {
    console.log("Project: no atlas.yaml (run `atlas init`)");
    return;
  }
  const ws = await resolveWorkspace();
  console.log(`Workspace: ${ws.label}`);
  const { sources } = await api(
    "GET",
    `/api/v1/cli/sources?workspaceId=${ws.id}`,
  );
  for (const s of sources) {
    console.log(`  source ${s.id.slice(0, 8)}  ${s.name}  [${s.status}]`);
  }
}

async function cmdSource(sub: string | undefined, rest: string[]) {
  if (sub === "add") {
    const p = rest[0];
    if (!p) fail("Usage: atlas source add <path>");
    const cfg = readAtlasYaml();
    if (!cfg) fail("No atlas.yaml. Run `atlas init` first.");
    cfg.sources ??= [];
    if (cfg.sources.some((s) => s.path === p)) fail(`${p} already added.`);
    cfg.sources.push({
      path: p,
      include: ["**"],
      exclude: [".env*", "node_modules/**", ".git/**"],
    });
    fs.writeFileSync(ATLAS_YAML, stringifyYaml(cfg));
    console.log(`Added source ${p}. Run \`atlas source sync\`.`);
    return;
  }

  if (sub === "list") {
    const ws = await resolveWorkspace();
    const { sources } = await api(
      "GET",
      `/api/v1/cli/sources?workspaceId=${ws.id}`,
    );
    if (sources.length === 0) console.log("No sources.");
    for (const s of sources) {
      console.log(`${s.id}  ${s.name}  ${s.origin}  [${s.status}]`);
    }
    return;
  }

  if (sub === "remove") {
    const id = rest[0];
    if (!id) fail("Usage: atlas source remove <sourceId>");
    await api("DELETE", "/api/v1/cli/sources", { sourceId: id });
    console.log("Source revoked.");
    return;
  }

  if (sub === "sync") {
    const yes = rest.includes("--yes") || rest.includes("-y");
    const cfg = readAtlasYaml();
    if (!cfg?.sources?.length) fail("No sources in atlas.yaml.");
    const ws = await resolveWorkspace();

    for (const src of cfg.sources) {
      const root = path.resolve(src.path);
      if (!fs.existsSync(root)) fail(`Path not found: ${src.path}`);
      const { files, skipped } = collectFiles(
        root,
        src.include ?? ["**"],
        src.exclude ?? [],
      );
      const totalBytes = files.reduce((a, f) => a + f.bytes, 0);

      console.log(`\nSource ${src.path} → workspace ${ws.label}`);
      console.log(
        `  ${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB`,
      );
      for (const s of skipped) console.log(`  skip ${s.path} — ${s.reason}`);
      if (files.length === 0) {
        console.log("  Nothing to upload.");
        continue;
      }

      if (!yes) {
        // Dry-run manifest before first upload (spec §7).
        console.log("\n  Files:");
        for (const f of files.slice(0, 40)) console.log(`    ${f.path}`);
        if (files.length > 40)
          console.log(`    … and ${files.length - 40} more`);
        const ok = await promptYesNo("  Upload these files?");
        if (!ok) {
          console.log("  Skipped.");
          continue;
        }
      }

      const name = path.basename(root) || "source";
      const origin = `path:${name}:${createHash("sha256")
        .update(root)
        .digest("hex")
        .slice(0, 12)}`;
      const res = await api("POST", "/api/v1/cli/sources/sync", {
        workspaceId: ws.id,
        name,
        origin,
        syncRules: {
          include: src.include ?? ["**"],
          exclude: src.exclude ?? [],
        },
        files: files.map((f) => ({
          path: f.path,
          content: fs.readFileSync(f.abs).toString("base64"),
        })),
      });
      console.log(
        res.unchanged
          ? `  Unchanged (v${res.version}).`
          : `  Synced v${res.version} (${res.fileCount} files).`,
      );
    }
    return;
  }

  fail("Usage: atlas source <add|list|sync|remove>");
}

async function cmdSpecialist(sub: string | undefined, rest: string[]) {
  const ws = () => resolveWorkspace();
  if (sub === "list" || !sub) {
    const w = await ws();
    const { specialists } = await api(
      "GET",
      `/api/v1/cli/specialists?workspaceId=${w.id}`,
    );
    if (specialists.length === 0) console.log("No specialists.");
    for (const s of specialists) {
      console.log(`${s.slug}  ${s.name}  [${s.state}]`);
    }
    return;
  }
  if (sub === "create") {
    const prompt = rest.join(" ");
    if (!prompt) fail('Usage: atlas specialist create "<what it should do>"');
    const w = await ws();
    const created = await api("POST", "/api/v1/cli/specialists", {
      workspaceId: w.id,
      prompt,
    });
    console.log(
      `Created ${created.specialist.slug} (draft). Open: ${baseUrl()}/app/w/${w.id}/t/${created.threadId}`,
    );
    return;
  }
  if (sub === "inspect") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas specialist inspect <slug>");
    const w = await ws();
    const { specialists } = await api(
      "GET",
      `/api/v1/cli/specialists?workspaceId=${w.id}`,
    );
    const sp = specialists.find((s: any) => s.slug === slug || s.id === slug);
    if (!sp) fail(`Not found: ${slug}`);
    console.log(JSON.stringify(sp, null, 2));
    return;
  }
  if (sub === "run") {
    const slug = rest[0];
    const message = rest.slice(1).join(" ");
    if (!slug || !message) {
      fail('Usage: atlas specialist run <slug> "<message>"');
    }
    const w = await ws();
    const sp = await findSpecialist(w.id, slug);
    const res = await api("POST", "/api/v1/cli/runs", {
      specialistId: sp.id,
      message,
    });
    console.log(`Run ${res.runId} queued. \`atlas wait ${res.runId}\``);
    return;
  }
  if (sub === "deploy") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas specialist deploy <slug>");
    const w = await ws();
    const sp = await findSpecialist(w.id, slug);
    const { deployment } = await api("POST", "/api/v1/cli/specialists/deploy", {
      specialistId: sp.id,
    });
    console.log(`Deployed ${slug} (deployment ${deployment.id}).`);
    return;
  }
  if (sub === "eval") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas specialist eval <slug>");
    const w = await ws();
    const sp = await findSpecialist(w.id, slug);
    const { evaluationRun } = await api("POST", "/api/v1/cli/evaluations/run", {
      specialistId: sp.id,
    });
    console.log(
      `Evaluation ${evaluationRun.status}: ${evaluationRun.passedCases} passed, ${evaluationRun.failedCases} failed.`,
    );
    if (evaluationRun.status === "failed") process.exit(1);
    return;
  }
  fail("Usage: atlas specialist <create|list|inspect|run|eval|deploy>");
}

async function findSpecialist(workspaceId: string, slugOrId: string) {
  const { specialists } = await api(
    "GET",
    `/api/v1/cli/specialists?workspaceId=${workspaceId}`,
  );
  const sp = specialists.find(
    (s: any) => s.slug === slugOrId || s.id === slugOrId,
  );
  if (!sp) fail(`Specialist not found: ${slugOrId}`);
  return sp;
}

async function cmdLogs(runId: string | undefined) {
  const id = runId ?? (await latestRunId());
  const { run, events } = await api("GET", `/api/v1/cli/runs?runId=${id}`);
  console.log(
    `run ${run.id}  [${run.status}]${run.error ? `  ${run.error}` : ""}`,
  );
  for (const e of events) {
    console.log(
      `  ${String(e.seq).padStart(3)}  ${e.kind}  ${JSON.stringify(e.payload)}`,
    );
  }
}

async function cmdWait(runId: string | undefined) {
  const id = runId ?? (await latestRunId());
  for (;;) {
    const { run } = await api("GET", `/api/v1/cli/runs?runId=${id}`);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      console.log(`run ${run.id} ${run.status}`);
      if (run.status === "failed") process.exit(1);
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function latestRunId(): Promise<string> {
  const cfg = readAtlasYaml();
  if (!cfg?.specialist)
    fail("Pass a run id, or set `specialist` in atlas.yaml.");
  const w = await resolveWorkspace();
  const sp = await findSpecialist(w.id, cfg.specialist);
  const { runs } = await api("GET", `/api/v1/cli/runs?specialistId=${sp.id}`);
  if (!runs.length) fail("No runs yet.");
  return runs[0].id;
}

async function cmdApiKey(sub: string | undefined, rest: string[]) {
  const spArg = rest[0] ?? readAtlasYaml()?.specialist;
  if (sub === "list") {
    if (!spArg) fail("Usage: atlas api-key list <specialist>");
    const w = await resolveWorkspace();
    const sp = await findSpecialist(w.id, spArg);
    const { keys } = await api(
      "GET",
      `/api/v1/cli/api-keys?specialistId=${sp.id}`,
    );
    if (!keys.length) console.log("No active keys.");
    for (const k of keys) {
      console.log(
        `${k.id}  ${k.keyPrefix}…  ${k.label}  [${k.scopes.join(",")}]`,
      );
    }
    return;
  }
  if (sub === "create") {
    if (!spArg) fail("Usage: atlas api-key create <specialist> [label]");
    const w = await resolveWorkspace();
    const sp = await findSpecialist(w.id, spArg);
    const key = await api("POST", "/api/v1/cli/api-keys", {
      specialistId: sp.id,
      label: rest[1] ?? "CLI key",
    });
    console.log(`Key created (shown once):\n${key.secret}`);
    return;
  }
  if (sub === "revoke") {
    const keyId = rest[0];
    if (!keyId) fail("Usage: atlas api-key revoke <keyId>");
    await api("DELETE", "/api/v1/cli/api-keys", { keyId });
    console.log("Key revoked.");
    return;
  }
  fail("Usage: atlas api-key <create|list|revoke>");
}

function cmdOpen() {
  openBrowser(`${baseUrl()}/app`);
  console.log(`${baseUrl()}/app`);
}

function promptYesNo(q: string): Promise<boolean> {
  process.stdout.write(`${q} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d) => {
      process.stdin.pause();
      resolve(/^y(es)?$/i.test(String(d).trim()));
    });
    process.stdin.resume();
  });
}

/* -------------------------------- main ------------------------------- */

const HELP = `atlas — Atlas Labs CLI

  atlas login | logout | whoami
  atlas group list | create <name> | use <slug>
  atlas member invite <email> [role]
  atlas init | link | status | open
  atlas source add <path> | list | sync [--yes] | remove <id>
  atlas specialist create "<prompt>" | list | inspect <slug>
  atlas specialist run <slug> "<message>" | eval <slug> | deploy <slug>
  atlas logs [run] | wait [run]
  atlas api-key create <specialist> [label] | list | revoke <keyId>

Server: ATLAS_BASE_URL (default ${DEFAULT_BASE})`;

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "login":
      return cmdLogin();
    case "logout":
      return cmdLogout();
    case "whoami":
      return cmdWhoami();
    case "group":
      return cmdGroup(sub, rest);
    case "member":
      return cmdMember(sub, rest);
    case "init":
      return cmdInit();
    case "link":
      return cmdLink();
    case "status":
      return cmdStatus();
    case "source":
      return cmdSource(sub, rest);
    case "specialist":
      return cmdSpecialist(sub, rest);
    case "open":
      return cmdOpen();
    case "logs":
      return cmdLogs(sub);
    case "wait":
      return cmdWait(sub);
    case "api-key":
      return cmdApiKey(sub, rest);
    default:
      console.log(HELP);
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("cli.js"));
if (isDirectRun) {
  main().catch((err) => fail(String(err?.message ?? err)));
}

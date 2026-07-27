#!/usr/bin/env node
/**
 * Atlas CLI — connect local work to Atlas specialist workspaces.
 *
 * Zero runtime dependencies except `yaml` (atlas.yaml). Auth token is kept in
 * the macOS keychain when available, else a 0600 file in the Atlas config
 * dir. Never written into project files.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/*
 * Production by default — this ships to users who have no local server.
 * Use the `www` host explicitly: the apex redirects, and a redirect hop drops
 * the Authorization header, so an apex call lands unauthenticated.
 * Override with ATLAS_BASE_URL (or `baseUrl` in the config file) for local dev.
 */
const DEFAULT_BASE =
  process.env.ATLAS_BASE_URL ?? "https://www.atlaslabs.id";

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

/**
 * Stable per-install id, generated once and kept in the config dir.
 *
 * This is a CONTINUITY HINT ONLY — it lets this machine keep one device
 * identity across re-logins. The authoritative device id is minted server-side;
 * the server matches this value scoped to the authenticating user, so it
 * carries no authority of its own.
 */
function installationId(): string {
  const file = path.join(configDir(), "installation");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // not created yet
  }
  const generated = randomUUID();
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
  return generated;
}

/** Coarse platform string for the device list. Never a fingerprint. */
function platformLabel(): string {
  const names: Record<string, string> = {
    darwin: "macOS",
    win32: "Windows",
    linux: "Linux",
  };
  return `${names[process.platform] ?? process.platform} ${os.release()}`;
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
        // `security` writes "item could not be found" to stderr on a miss,
        // which is a normal state (file fallback) — don't show it to the user
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
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

/*
 * Best-effort browser launch. Never fatal: a failure here costs convenience,
 * not the flow the caller is in the middle of.
 *
 * `start` is a cmd.exe builtin, not an executable, so it can only be reached
 * through `cmd /c`. The empty string after it is the window title — `start`
 * treats a lone quoted argument as the title, so without it a quoted URL opens
 * a console window instead of the browser.
 */
function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const manually = () => console.log(`Open this URL manually: ${url}`);
  try {
    const child = spawn(cmd as string, args as string[], {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    // spawn reports a missing binary asynchronously — try/catch never sees it.
    child.on("error", manually);
    child.unref();
  } catch {
    manually();
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
    {
      installation_id: installationId(),
      kind: "cli",
      label: `${os.hostname()} (CLI)`.slice(0, 128),
      platform: platformLabel(),
    },
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
  await cmdInvite(rest[0], rest.slice(1));
}

/**
 * Everything after the email in `atlas invite`.
 *
 * A flag whose value is missing or is itself a flag is an error rather than a
 * silent default: `--machine --role owner` must not invite someone to a machine
 * named "--role".
 */
export function parseInviteArgs(
  rest: string[],
): { role: string; machineSlug?: string } | { error: string } {
  const flags: Record<string, string> = {};
  for (const name of ["--role", "--machine"]) {
    const i = rest.indexOf(name);
    if (i === -1) continue;
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) return { error: `${name} needs a value.` };
    flags[name] = value;
  }
  // `atlas member invite <email> <role>` predates the flags; keep it working.
  const positionalRole = rest[0]?.startsWith("--") ? undefined : rest[0];
  return {
    role: flags["--role"] ?? positionalRole ?? "operator",
    machineSlug: flags["--machine"],
  };
}

/**
 * Pull a human into the current group and email them the accept link plus the
 * commands that follow it. `--machine <slug>` names the machine they are being
 * brought in for, so the invite arrives with its id rather than "ask Ben".
 */
async function cmdInvite(email: string | undefined, rest: string[]) {
  const usage =
    "Usage: atlas invite <email> [--role owner|builder|operator|viewer] [--machine <slug>]";
  if (!email || email.startsWith("--")) fail(usage);

  const parsed = parseInviteArgs(rest);
  if ("error" in parsed) fail(parsed.error);
  const { role, machineSlug } = parsed;

  const slug = readConfig().currentGroup ?? readAtlasYaml()?.group;
  if (!slug) fail("No current group. `atlas group use <slug>` first.");
  const groupId = await resolveGroupId(slug);

  const inv = (await api("POST", "/api/v1/cli/invitations", {
    groupId,
    email,
    role,
    machineSlug,
  })) as {
    token: string;
    acceptUrl: string;
    machine: { id: string; slug: string } | null;
    notified: boolean;
    notifyError: string | null;
  };

  console.log(`Invited ${email} to ${slug} as ${role}.`);
  if (inv.machine) {
    console.log(`Machine: ${inv.machine.slug} (${inv.machine.id})`);
  }
  console.log(
    inv.notified
      ? `Emailed to ${email}.`
      : `Not emailed${inv.notifyError ? ` (${inv.notifyError})` : ""} — send this link:`,
  );
  console.log(inv.acceptUrl);
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

function cmdOpen(slug?: string) {
  // `atlas open <slug>` hands off to Atlas Browser via the custom scheme
  if (slug) {
    const url = `atlas://workspace/${slug}`;
    openBrowser(url);
    console.log(url);
    return;
  }
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

type DeviceRow = {
  id: string;
  kind: string;
  label: string;
  platform: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  current: boolean;
};

/* -------------------------------- ping ------------------------------ */

type PingRow = {
  id: string;
  status: "pending" | "answered" | "expired" | "cancelled";
  question: string;
  answer: string | null;
  context: string | null;
  createdAt: string;
  answeredAt: string | null;
};

/**
 * Ask the human a question and wait for their reply.
 *
 * Blocks so an agent can use the answer inline instead of stopping the whole
 * run to ask in chat. On timeout it exits non-zero with the reply link still
 * live, so the caller can decide whether to keep waiting or proceed on a
 * default — the question is never lost.
 */
/**
 * Split `ping_user` args into the question, dropping flags and their values.
 *
 * The -1 guards matter: without them an absent flag makes `indexOf` return -1,
 * and the "flag + 1" check then matches index 0 and swallows the question.
 */
export function parsePingQuestion(rest: string[]): string {
  const consumed = new Set<number>();
  for (const flag of ["--timeout", "--context"]) {
    const idx = rest.indexOf(flag);
    if (idx !== -1) {
      consumed.add(idx);
      consumed.add(idx + 1);
    }
  }
  return rest
    .filter((a, i) => a !== "--no-wait" && !consumed.has(i))
    .join(" ")
    .trim();
}

async function cmdPingUser(slug: string | undefined, rest: string[]) {
  if (!slug) {
    fail('Usage: atlas ping_user <slug> "<question>" [--timeout <seconds>] [--context <label>] [--no-wait]');
  }

  const timeoutIdx = rest.indexOf("--timeout");
  const contextIdx = rest.indexOf("--context");
  const noWait = rest.includes("--no-wait");

  const question = parsePingQuestion(rest);

  if (!question) fail('A question is required: atlas ping_user <slug> "should I use Postgres or SQLite?"');

  const timeoutSec = timeoutIdx === -1 ? 300 : Number(rest[timeoutIdx + 1]);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    fail("--timeout must be a positive number of seconds");
  }

  const m = await findMachine(slug);
  const res = (await api("POST", `/api/v1/machines/${m.id}/ping`, {
    question,
    context: contextIdx === -1 ? undefined : rest[contextIdx + 1],
    ttlSeconds: Math.ceil(timeoutSec),
  })) as {
    ping: { id: string };
    replyUrl: string;
    notified: boolean;
    notifyError: string | null;
  };

  // Everything but the answer goes to stderr, so `$(atlas ping_user …)`
  // captures exactly the human's reply and nothing else.
  process.stderr.write(`Asked: ${question}\n`);
  process.stderr.write(`Reply: ${res.replyUrl}\n`);
  if (!res.notified) {
    process.stderr.write(
      `(not delivered${res.notifyError ? `: ${res.notifyError}` : ""} — send the link above)\n`,
    );
  }

  if (noWait) {
    process.stderr.write(`Ping ${res.ping.id} created; not waiting.\n`);
    return;
  }

  const deadline = Date.now() + timeoutSec * 1000;
  let delay = 2000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 10000); // back off; a human is not fast
    const { ping } = (await api("GET", `/api/v1/pings/${res.ping.id}`)) as {
      ping: PingRow;
    };
    if (ping.status === "answered") {
      process.stderr.write("Answered.\n");
      process.stdout.write(`${ping.answer ?? ""}\n`);
      return;
    }
    if (ping.status === "expired" || ping.status === "cancelled") break;
  }

  process.stderr.write(
    `No reply within ${timeoutSec}s. The link stays open: ${res.replyUrl}\n`,
  );
  process.exitCode = 2;
}

/** The message log: every question asked of the human on this machine. */
async function cmdPingLog(slug: string | undefined) {
  if (!slug) fail("Usage: atlas ping log <slug>");
  const m = await findMachine(slug);
  const { pings } = (await api("GET", `/api/v1/machines/${m.id}/ping`)) as {
    pings: PingRow[];
  };
  if (!pings.length) return console.log("No pings on this machine yet.");

  for (const p of pings) {
    const when = new Date(p.createdAt).toISOString().slice(0, 16).replace("T", " ");
    console.log(`[${when}] ${p.status.toUpperCase()}${p.context ? ` (${p.context})` : ""}`);
    console.log(`  Q: ${p.question}`);
    if (p.answer) console.log(`  A: ${p.answer}`);
    console.log("");
  }
}

async function cmdPing(sub: string | undefined, rest: string[]) {
  if (sub === "log") return cmdPingLog(rest[0]);
  fail("Usage: atlas ping log <slug>   (to ask: atlas ping_user <slug> \"<question>\")");
}

/* ------------------------------ machines ---------------------------- */

type MachineRow = {
  id: string;
  slug: string;
  name: string | null;
  status: string;
  ports: { port: number; label?: string }[];
  url: string;
};

/** Resolve a machine by slug within the current workspace. */
async function findMachine(slug: string): Promise<MachineRow> {
  const w = await resolveWorkspace();
  const { machine } = (await api(
    "GET",
    `/api/v1/machines/by-slug/${encodeURIComponent(slug)}?workspaceId=${w.id}`,
  )) as { machine: MachineRow };
  return machine;
}

async function cmdMachine(sub: string | undefined, rest: string[]) {
  if (sub === "list" || sub === "ls") {
    const w = await resolveWorkspace();
    const { machines } = (await api(
      "GET",
      `/api/v1/machines?workspaceId=${w.id}`,
    )) as { machines: MachineRow[] };
    if (!machines.length) {
      return console.log("No machines. Create one with `atlas machine create <slug>`.");
    }
    for (const m of machines) {
      const ports = m.ports.map((p) => p.port).join(",");
      console.log(
        `${m.slug.padEnd(24)} ${m.status.padEnd(12)} ${ports ? `ports ${ports}` : ""}`,
      );
    }
    return;
  }

  if (sub === "create") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas machine create <slug> [--template <id>]");
    const templateIdx = rest.indexOf("--template");
    const w = await resolveWorkspace();
    const { machine } = (await api("POST", "/api/v1/machines", {
      slug,
      workspaceId: w.id,
      ...(templateIdx !== -1 ? { templateId: rest[templateIdx + 1] } : {}),
    })) as { machine: MachineRow };
    console.log(`Created ${machine.slug} (${machine.status})`);
    console.log(machine.url);
    return;
  }

  if (sub === "status") {
    const slug = rest[0];
    if (!slug) fail("Usage: atlas machine status <slug>");
    const m = await findMachine(slug);
    console.log(`${m.slug}  ${m.status}`);
    for (const p of m.ports) {
      console.log(`  port ${p.port}${p.label ? `  ${p.label}` : ""}`);
    }
    return;
  }

  if (sub === "remove" || sub === "rm" || sub === "stop") {
    const slug = rest[0];
    if (!slug) fail(`Usage: atlas machine ${sub} <slug>`);
    const m = await findMachine(slug);
    await api("POST", `/api/v1/machines/${m.id}/stop`);
    console.log(`Stopped ${slug}.`);
    return;
  }

  if (sub === "suspend" || sub === "resume") {
    const slug = rest[0];
    if (!slug) fail(`Usage: atlas machine ${sub} <slug>`);
    const m = await findMachine(slug);
    await api("POST", `/api/v1/machines/${m.id}/${sub}`);
    console.log(`${sub === "suspend" ? "Suspended" : "Resumed"} ${slug}.`);
    return;
  }

  fail("Usage: atlas machine <create|list|status|suspend|resume|stop>");
}

/**
 * Everything after the first `--` is the remote command, verbatim — including
 * anything that looks like a flag. Without `--`, the whole tail is the command.
 */
export function parseExecArgs(rest: string[]): string[] {
  const sep = rest.indexOf("--");
  return sep === -1 ? rest : rest.slice(sep + 1);
}

async function cmdExec(slug: string | undefined, rest: string[]) {
  if (!slug) fail("Usage: atlas exec <slug> -- <command...>");
  const parts = parseExecArgs(rest);
  if (!parts.length) fail("Usage: atlas exec <slug> -- <command...>");

  const m = await findMachine(slug);
  const result = (await api("POST", `/api/v1/machines/${m.id}/exec`, {
    cmd: parts.join(" "),
  })) as { exitCode: number; stdout: string; stderr: string };

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  // propagate the remote exit code — a wrapper that always exits 0 breaks
  // every script that checks it
  process.exitCode = result.exitCode;
}

/**
 * Remote paths are workspace-relative — the machine's workdir is /workspace.
 *
 * Accepts `/workspace/x` for convenience because that is what `exec`/`ls` show,
 * but refuses other absolute paths rather than silently rewriting them: turning
 * `/etc/hosts` into a workspace-relative write is the kind of guess that
 * quietly puts a file somewhere the user did not ask for.
 */
export function remotePath(input: string): string {
  if (input.startsWith("/workspace/")) return input.slice("/workspace/".length);
  if (input === "/workspace") return "";
  if (input.startsWith("/")) {
    fail(
      `Remote paths are relative to the workspace. Use "${input.replace(/^\/+/, "")}" or a /workspace/... path.`,
    );
  }
  return input;
}

async function cmdPut(slug: string | undefined, rest: string[]) {
  const [local, remote] = rest;
  if (!slug || !local || !remote) {
    fail("Usage: atlas put <slug> <localPath> <remotePath>");
  }
  const m = await findMachine(slug);
  const token = loadToken();
  if (!token) fail("Not logged in. Run `atlas login` first.");
  const body = fs.readFileSync(local);
  const res = await fetch(
    `${baseUrl()}/api/v1/machines/${m.id}/files/${remotePath(remote)}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array(body),
    },
  );
  if (!res.ok) fail(`Upload failed (${res.status})`);
  console.log(`Uploaded ${local} -> ${slug}:${remote}`);
}

async function cmdGet(slug: string | undefined, rest: string[]) {
  const [remote, local] = rest;
  if (!slug || !remote) fail("Usage: atlas get <slug> <remotePath> [localPath|-]");
  const m = await findMachine(slug);
  const token = loadToken();
  if (!token) fail("Not logged in. Run `atlas login` first.");
  const res = await fetch(
    `${baseUrl()}/api/v1/machines/${m.id}/files/${remotePath(remote)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) fail(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!local || local === "-") {
    process.stdout.write(buf);
  } else {
    fs.writeFileSync(local, buf);
    console.log(`Wrote ${local}`);
  }
}

async function cmdPorts(slug: string | undefined) {
  if (!slug) fail("Usage: atlas ports <slug>");
  const m = await findMachine(slug);
  const { ports } = (await api("GET", `/api/v1/machines/${m.id}/ports`)) as {
    ports: { port: number; label?: string }[];
  };
  if (!ports.length) return console.log("No ports.");
  for (const p of ports) {
    console.log(`${p.port}${p.label ? `  ${p.label}` : ""}`);
  }
}

async function cmdDevice(sub: string | undefined, rest: string[]) {
  if (sub === "list" || sub === "ls" || sub === undefined) {
    const { devices } = (await api("GET", "/api/v1/devices")) as {
      devices: DeviceRow[];
    };
    if (!devices.length) return console.log("No devices.");
    for (const d of devices) {
      const seen = d.lastSeenAt
        ? new Date(d.lastSeenAt).toISOString().slice(0, 16).replace("T", " ")
        : "never";
      const flags = [
        d.current ? "current" : null,
        d.revokedAt ? "revoked" : null,
      ]
        .filter(Boolean)
        .join(",");
      console.log(
        `${d.id}  ${d.kind.padEnd(7)}  ${d.label}  ${d.platform ?? ""}  last seen ${seen}${flags ? `  [${flags}]` : ""}`,
      );
    }
    return;
  }
  if (sub === "remove" || sub === "rm" || sub === "revoke") {
    const deviceId = rest[0];
    if (!deviceId) fail("Usage: atlas device rm <deviceId>");
    await api("POST", `/api/v1/devices/${deviceId}/revoke`);
    console.log("Device revoked. Its tokens no longer work.");
    return;
  }
  fail("Usage: atlas device <list|rm>");
}

const HELP = `atlas — Atlas Labs CLI

  atlas login | logout | whoami
  atlas group list | create <name> | use <slug>
  atlas invite <email> [--role <role>] [--machine <slug>]
  atlas init | link | status | open
  atlas source add <path> | list | sync [--yes] | remove <id>
  atlas specialist create "<prompt>" | list | inspect <slug>
  atlas specialist run <slug> "<message>" | eval <slug> | deploy <slug>
  atlas logs [run] | wait [run]
  atlas api-key create <specialist> [label] | list | revoke <keyId>
  atlas device list | rm <deviceId>
  atlas machine create <slug> [--template <id>] | list | status <slug>
  atlas machine suspend | resume | stop <slug>
  atlas exec <slug> -- <command...>
  atlas put <slug> <local> <remote> | get <slug> <remote> [local|-]
  atlas ports <slug>
  atlas ping_user <slug> "<question>" [--timeout <s>] [--context <l>] [--no-wait]
  atlas ping log <slug>

Inside a deployment (no login; uses ATLAS_DEPLOY_TOKEN):
  atlas vm ready --url <url> [--note <text>]
  atlas vm notify "<message>"
  atlas vm status

Server: ATLAS_BASE_URL (default ${DEFAULT_BASE})`;


/* ------------------------------ vm mode ----------------------------- */

/**
 * VM mode: the CLI running inside a deployed container.
 *
 * There is no login and no config file in a container — the credential is
 * ATLAS_DEPLOY_TOKEN, injected by Atlas at deploy time and scoped to one
 * machine. It can do exactly two things: report a live URL and post an update
 * to everyone on the project. It cannot read files, run commands, or act as
 * the person who deployed it, so leaking it out of the image costs the project
 * some noise rather than an account.
 *
 * Every `atlas vm` command exits 0 when the token is absent. A deployment must
 * not crash-loop because its optional reporting integration is unconfigured.
 */
export function deployToken(): string | null {
  const token = process.env.ATLAS_DEPLOY_TOKEN?.trim();
  return token && token.startsWith("atlas_dt_") ? token : null;
}

function vmBaseUrl(): string {
  return (process.env.ATLAS_API_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
}

async function vmApi(route: string, body: unknown): Promise<any> {
  const token = deployToken();
  if (!token) return null;
  const res = await fetch(`${vmBaseUrl()}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    // Reported, not thrown: see the note above about crash loops.
    console.error(`atlas vm: ${res.status} ${json?.error ?? "request failed"}`);
    return null;
  }
  return json;
}

export function flagValue(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
}

async function cmdVm(sub: string | undefined, rest: string[]) {
  if (!deployToken()) {
    console.log(
      "atlas vm: no ATLAS_DEPLOY_TOKEN in this environment — nothing to report.",
    );
    return;
  }

  switch (sub) {
    case "ready": {
      const url =
        flagValue(rest, "url") ??
        (process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : undefined);
      if (!url) {
        return fail("Usage: atlas vm ready --url <url>");
      }
      const note = flagValue(rest, "note");
      const res = await vmApi("/api/v1/vm/ready", { url, note });
      if (res?.ok) {
        console.log(
          res.notified
            ? `Reported live at ${url} — told ${res.recipients ?? 0} on the project.`
            : `Reported live at ${url}.`,
        );
      }
      return;
    }

    case "notify": {
      const message = rest.filter((a) => !a.startsWith("--")).join(" ").trim();
      if (!message) return fail('Usage: atlas vm notify "<message>"');
      const res = await vmApi("/api/v1/vm/notify", { message });
      if (res?.ok) {
        console.log(`Update sent to ${res.recipients ?? 0} on the project.`);
      }
      return;
    }

    case "status":
    case undefined: {
      const res = await vmApi("/api/v1/vm/heartbeat", {});
      if (res?.ok) {
        console.log(
          `Connected as deployment of ${res.machine}${res.liveUrl ? ` (${res.liveUrl})` : ""}.`,
        );
      }
      return;
    }

    default:
      return fail("Usage: atlas vm ready --url <url> | notify \"<msg>\" | status");
  }
}

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
    case "invite":
    case "invite_to_space":
    case "invite-to-space":
      return cmdInvite(sub, rest);
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
      return cmdOpen(sub);
    case "logs":
      return cmdLogs(sub);
    case "wait":
      return cmdWait(sub);
    case "api-key":
      return cmdApiKey(sub, rest);
    case "device":
      return cmdDevice(sub, rest);
    case "machine":
      return cmdMachine(sub, rest);
    case "exec":
      return cmdExec(sub, rest);
    case "put":
      return cmdPut(sub, rest);
    case "get":
      return cmdGet(sub, rest);
    case "ports":
      return cmdPorts(sub);
    case "ping_user":
    case "ping-user":
      return cmdPingUser(sub, rest);
    case "ping":
      return cmdPing(sub, rest);
    case "vm":
      return cmdVm(sub, rest);
    default:
      console.log(HELP);
  }
}

/*
 * Run main() only when invoked as a program, never when the test file imports
 * this module. Matches the source entry (cli.ts/cli.js), the single-file bundle
 * (atlas.cjs), and the installed binary (…/bin/atlas, no extension).
 */
const ENTRY_NAMES = ["cli.ts", "cli.js", "atlas.cjs", "atlas.js", "atlas"];
const invokedAs = process.argv[1]?.split(/[\\/]/).pop() ?? "";
const isDirectRun = ENTRY_NAMES.includes(invokedAs);
if (isDirectRun) {
  main().catch((err) => fail(String(err?.message ?? err)));
}

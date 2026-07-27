import { getConnectionToken, saveConnection } from "@/server/connections";
import type { Machine } from "@/server/machines/authz";
import { execOnMachine } from "@/server/machines/store";
import { shellQuote } from "@/server/shell";

/**
 * GitHub connection: OAuth on behalf of the user, then repo access from inside
 * a space.
 *
 * The token never appears in a command string — `machineExecs` records every
 * command we run, and a clone URL with the credential inlined would write a
 * live GitHub token into the database and into anyone's exec history. It is
 * passed through the environment instead.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

/** `repo` covers private clones and pushes; `read:user` names the account. */
const SCOPES = "repo read:user";

export function githubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

function requireConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub is not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET",
    );
  }
  return { clientId, clientSecret };
}

export function authorizeUrl(input: {
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = requireConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", input.state);
  return url.toString();
}

type GitHubUser = { id: number; login: string };

/** Exchange the callback code and persist the connection. */
export async function completeOAuth(input: {
  code: string;
  redirectUri: string;
  userId: string;
}): Promise<{ login: string }> {
  const { clientId, clientSecret } = requireConfig();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? `GitHub token exchange failed (${res.status})`,
    );
  }

  const me = await api<GitHubUser>(json.access_token, "/user");
  await saveConnection({
    userId: input.userId,
    provider: "github",
    accessToken: json.access_token,
    externalId: String(me.id),
    login: me.login,
    scope: json.scope ?? SCOPES,
  });
  return { login: me.login };
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export type RepoSummary = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string | null;
};

/** Repos the connected account can push to, most recently pushed first. */
export async function listRepos(userId: string): Promise<RepoSummary[]> {
  const token = await getConnectionToken(userId, "github");
  if (!token) return [];
  const repos = await api<
    {
      full_name: string;
      private: boolean;
      default_branch: string;
      description: string | null;
      pushed_at: string | null;
    }[]
  >(
    token,
    "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member",
  );
  return repos.map((r) => ({
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    description: r.description,
    pushedAt: r.pushed_at,
  }));
}

/** `owner/repo` — anything else is rejected before it reaches a shell. */
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function assertRepoFullName(fullName: string): string {
  if (!REPO_RE.test(fullName)) {
    throw new Error(`"${fullName}" is not a valid owner/repo name`);
  }
  return fullName;
}

/**
 * Clone a repo into the space at /workspace/<repo>.
 *
 * Shallow by default: spaces are for working on the tip, and full history on a
 * large repo is minutes of clone time nobody asked for.
 */
export async function cloneRepoIntoSpace(input: {
  userId: string;
  machine: Machine;
  fullName: string;
  branch?: string | null;
  depth?: number;
}): Promise<{ dir: string; output: string }> {
  const fullName = assertRepoFullName(input.fullName);
  const token = await getConnectionToken(input.userId, "github");
  if (!token) throw new Error("Connect GitHub first.");

  const dir = fullName.split("/")[1]!;
  const branch =
    input.branch && /^[A-Za-z0-9._/-]+$/.test(input.branch)
      ? input.branch
      : null;

  const res = await execOnMachine(
    input.machine,
    {
      // $GH_TOKEN stays unexpanded in the stored command — see the file header.
      cmd: [
        `rm -rf ${shellQuote(dir)} &&`,
        `git clone --depth ${input.depth ?? 1}`,
        branch ? `--branch ${shellQuote(branch)}` : "",
        // Double-quoted on purpose: $GH_TOKEN must expand from the env. The
        // rest of the URL is REPO_RE-validated, so nothing else can expand.
        `"https://x-access-token:$GH_TOKEN@github.com/${fullName}.git"`,
        shellQuote(dir),
      ]
        .filter(Boolean)
        .join(" "),
      env: { GH_TOKEN: token },
    },
    { userId: input.userId },
  );

  if (res.exitCode !== 0) {
    throw new Error(
      // Defensive: a git error echoing the remote URL would leak the token.
      `Clone failed: ${redact(res.stderr || res.stdout, token)}`,
    );
  }
  return { dir, output: redact(res.stdout, token) };
}

function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

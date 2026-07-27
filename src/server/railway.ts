import { getConnectionToken } from "@/server/connections";
import type { Machine } from "@/server/machines/authz";
import {
  execOnMachine,
  getMachineFile,
  putMachineFile,
} from "@/server/machines/store";
import { appOrigin } from "@/server/email";
import { assertRelativeDir, shellArgs, shellQuote } from "@/server/shell";
import { mintDeployToken } from "@/server/deploy/tokens";
import { SCAFFOLD_EXECUTABLE, SCAFFOLD_FILES } from "@/server/spaces/scaffold";

/**
 * Deploy a space to Railway.
 *
 * The token we store is a Railway **project token**: it scopes to one project,
 * and it is the only credential `railway up` accepts without an interactive
 * link step. An account token would work too but would let a space deploy over
 * any project the user owns — more blast radius than this feature needs.
 *
 * As with GitHub, the token is passed through the environment so it never
 * lands in the `machineExecs` command log.
 */

const CLI_INSTALL = "npm i -g @railway/cli";

export type DeployResult = {
  ok: boolean;
  url: string | null;
  output: string;
};

/** Re-write any scaffold file the space is missing, so a deploy has something to build. */
export async function ensureScaffold(
  machine: Machine,
  userId?: string,
): Promise<string[]> {
  const restored: string[] = [];
  for (const [path, body] of Object.entries(SCAFFOLD_FILES)) {
    const existing = await getMachineFile(machine, path);
    if (existing) continue;
    await putMachineFile(machine, path, new TextEncoder().encode(body));
    restored.push(path);
  }

  // The entrypoint is copied into the image and exec'd; a file written without
  // the bit set builds fine and then fails at container start.
  if (userId && SCAFFOLD_EXECUTABLE.length) {
    await execOnMachine(
      machine,
      {
        cmd: `chmod +x ${shellArgs(SCAFFOLD_EXECUTABLE)} 2>/dev/null || true`,
      },
      { userId },
    ).catch(() => undefined);
  }

  return restored;
}

async function run(
  machine: Machine,
  userId: string,
  cmd: string,
  token: string,
  opts: { env?: Record<string, string>; cwd?: string | null } = {},
) {
  return execOnMachine(
    machine,
    {
      cmd,
      // The working directory goes through the driver, not through a `cd`
      // prefix concatenated into the command — a directory name is data, and
      // the moment it is spliced into a shell string it becomes code.
      cwd: opts.cwd ?? null,
      env: { RAILWAY_TOKEN: token, ...opts.env },
    },
    { userId },
  );
}

/**
 * Build and ship the space's current files.
 *
 * Detached: a container build routinely runs past any request timeout, and a
 * deploy that fails because our HTTP request gave up is worse than one the
 * user watches in Railway.
 */
export async function deploySpace(input: {
  userId: string;
  machine: Machine;
  /** Subdirectory of /workspace to deploy. Defaults to the space root. */
  dir?: string | null;
}): Promise<DeployResult> {
  const token = await getConnectionToken(input.userId, "railway");
  if (!token) throw new Error("Connect Railway first.");

  const restored = await ensureScaffold(input.machine, input.userId);

  // Throws on traversal or an absolute path rather than sanitizing: this value
  // reaches a real filesystem on a real VM.
  const dir = assertRelativeDir(input.dir ?? "");

  /*
   * A fresh deploy token per deploy, so the previous image's copy stops working
   * the moment this one ships. Set through the Railway CLI rather than baked
   * into the image — a token in a layer is a token in every registry that
   * layer reaches.
   */
  const deployToken = await mintDeployToken({
    machine: input.machine,
    createdByUserId: input.userId,
    label: `Railway · ${input.machine.slug}`,
  });
  const vars = await run(
    input.machine,
    input.userId,
    // $ATLAS_DT stays unexpanded in the stored command — the token never
    // reaches the exec log, same rule as the GitHub and Railway credentials.
    // $ATLAS_DT is expanded by the shell from the env, so the token never
    // appears in the command text the exec log stores.
    `railway variables --set "ATLAS_DEPLOY_TOKEN=$ATLAS_DT" --set ${shellQuote(`ATLAS_API_URL=${appOrigin()}`)} --skip-deploys`,
    token,
    { env: { ATLAS_DT: deployToken.token }, cwd: dir },
  );
  if (vars.exitCode !== 0) {
    // Not fatal: the app still deploys, it just cannot report back.
    console.warn(
      `[railway] could not set deploy variables for ${input.machine.slug}`,
    );
  }

  const install = await run(
    input.machine,
    input.userId,
    `command -v railway >/dev/null || ${CLI_INSTALL}`,
    token,
  );
  if (install.exitCode !== 0) {
    return {
      ok: false,
      url: null,
      output: redact(install.stderr || install.stdout, token),
    };
  }

  const up = await run(
    input.machine,
    input.userId,
    `railway up --ci --detach`,
    token,
    { cwd: dir },
  );
  const output = redact(
    [up.stdout, up.stderr].filter(Boolean).join("\n"),
    token,
  );
  if (up.exitCode !== 0) {
    return { ok: false, url: null, output };
  }

  // `railway domain` prints the public URL, creating one if the service has none.
  const domain = await run(
    input.machine,
    input.userId,
    `railway domain`,
    token,
    {
      cwd: dir,
    },
  );
  const url = firstUrl(domain.stdout) ?? firstUrl(output);

  return {
    ok: true,
    url,
    output: [
      restored.length ? `Restored scaffold: ${restored.join(", ")}` : "",
      output,
      redact(domain.stdout, token),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function firstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s"']+/.exec(text);
  if (match) return match[0];
  // The CLI sometimes prints a bare host.
  const host =
    /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:up\.railway\.app|railway\.app)\b/i.exec(
      text,
    );
  return host ? `https://${host[0]}` : null;
}

function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

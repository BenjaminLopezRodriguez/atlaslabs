/**
 * Shell quoting.
 *
 * `JSON.stringify` is not a shell quoter and must never be used as one. It
 * wraps in *double* quotes, where `$`, backtick and backslash stay live, so
 * `JSON.stringify("a$(id)")` produces `"a$(id)"` — a command substitution the
 * shell happily runs. It escapes for a different grammar than the one the
 * string is about to be parsed by.
 *
 * Single quotes are the only shell context with no expansion at all. The one
 * character that cannot appear inside them is `'`, which is closed, escaped,
 * and reopened.
 */
export function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** Quote each argument and join them with spaces. */
export function shellArgs(values: string[]): string {
  return values.map(shellQuote).join(" ");
}

/**
 * A path safe to use as a working directory, or null for "the root".
 *
 * Rejects rather than sanitizes: silently stripping `..` out of `....//` puts
 * the traversal back together, and a caller that passed something strange
 * should hear about it instead of getting a quietly different directory.
 */
export function assertRelativeDir(raw: string): string | null {
  const dir = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (dir === "") return null;
  if (
    dir.startsWith("/") ||
    dir.includes("\0") ||
    dir.split("/").some((seg) => seg === ".." || seg === "" || seg === ".")
  ) {
    throw new Error(`Invalid directory: ${raw}`);
  }
  return dir;
}

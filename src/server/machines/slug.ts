/**
 * Workspace-machine slugs.
 *
 * A slug is a DNS label because it becomes a preview hostname
 * (`<slug>.<something>`) once port sharing lands. The same regex is enforced by
 * Atlas Browser before it will resolve `atlas://workspace/<slug>`.
 *
 * The server is the authority: the CLI deliberately does NOT re-implement this
 * check, so there is no second copy to drift.
 */

/** 1–63 chars, lowercase alphanumeric and dashes, no leading/trailing dash. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const SLUG_RULE =
  "Lowercase letters, numbers and dashes; 1–63 characters; cannot start or end with a dash.";

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

export class InvalidSlugError extends Error {
  constructor(value: unknown) {
    super(`Invalid machine slug ${JSON.stringify(value)}. ${SLUG_RULE}`);
    this.name = "InvalidSlugError";
  }
}

export function assertSlug(value: unknown): string {
  if (!isValidSlug(value)) throw new InvalidSlugError(value);
  return value;
}

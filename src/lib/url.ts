/**
 * URL scheme validation for anything that becomes a link.
 *
 * `new URL()` — and therefore Zod's `.url()` — accepts `javascript:alert(1)`
 * and `data:text/html,…` as perfectly valid URLs. Escaping does not help: the
 * scheme is the payload, and `href="javascript:…"` executes on click no matter
 * how carefully the characters were encoded.
 *
 * So the check is an allowlist of schemes, applied both when a URL is accepted
 * and again where it is rendered. Twice on purpose — the store is not the only
 * way a URL can reach a template.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** The URL if it is safe to link to, otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  return isSafeHttpUrl(value) ? value! : null;
}

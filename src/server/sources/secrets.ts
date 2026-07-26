/**
 * Secret-file and secret-content detection for source ingestion.
 * Server-side enforcement — the CLI performs the same checks client-side,
 * but the trust boundary is here.
 */

export const SECRET_PATH_PATTERNS: RegExp[] = [
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

export const SECRET_CONTENT_PATTERNS: RegExp[] = [
  /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bsk-[A-Za-z0-9]{20,}\b/, // common model-provider secret shape
  /\bghp_[A-Za-z0-9]{36,}\b/, // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack token
];

export function isSecretPath(path: string): boolean {
  return SECRET_PATH_PATTERNS.some((re) => re.test(path));
}

export function looksLikeSecretContent(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((re) => re.test(content));
}

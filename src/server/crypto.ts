import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Symmetric encryption for third-party tokens at rest.
 *
 * A GitHub or Railway token is a live credential to someone else's account, so
 * it never sits in the database in the clear — a Postgres backup or a leaked
 * read replica would otherwise hand over every connected account.
 */

const IV_BYTES = 12;

function key(): Buffer {
  const secret = process.env.ATLAS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ATLAS_ENCRYPTION_KEY must be set to at least 32 characters to store connection tokens",
    );
  }
  // Hash rather than truncate: accepts any passphrase and always yields 32 bytes.
  return createHash("sha256").update(secret).digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function decryptSecret(blob: string): string {
  const [version, iv, tag, body] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !body) {
    throw new Error("connection token is not in a readable format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

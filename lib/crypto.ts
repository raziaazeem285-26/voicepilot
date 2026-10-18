// AES-256-GCM encryption for provider credentials / integration configs at rest.
// Key comes from APP_ENCRYPTION_KEY env (32 random bytes, base64).
// Nothing encrypted here ever leaves the server: values are only decrypted
// inside server-side code paths.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey(): Buffer {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) throw new Error("APP_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

/** Encrypt a UTF-8 string. Returns "iv:ciphertext:tag" (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(":");
}

/** Decrypt a value produced by encryptSecret. */
export function decryptSecret(payload: string): string {
  const [ivB64, ctB64, tagB64] = payload.split(":");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}

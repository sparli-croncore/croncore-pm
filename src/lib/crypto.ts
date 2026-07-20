import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * AES-256-GCM encryption for credentials stored in the DB.
 *
 * Key resolution (zero-config locally):
 *   1. ENCRYPTION_KEY env var (recommended for production / Vercel), or
 *   2. a local key file (.croncore/encryption.key) auto-generated on first use.
 * Accepts a 32-byte key as base64/hex, or any passphrase (hashed to 32 bytes).
 *
 * Format stored: v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 */
const KEY_FILE = path.join(process.cwd(), ".croncore", "encryption.key");

function toKeyBuffer(raw: string): Buffer {
  for (const enc of ["base64", "hex"] as const) {
    try {
      const buf = Buffer.from(raw, enc);
      if (buf.length === 32) return buf;
    } catch {
      /* ignore */
    }
  }
  return createHash("sha256").update(raw).digest();
}

function key(): Buffer {
  if (process.env.ENCRYPTION_KEY) return toKeyBuffer(process.env.ENCRYPTION_KEY);
  // Local fallback: read or create a persistent key file (no .env write needed).
  try {
    if (existsSync(KEY_FILE)) return toKeyBuffer(readFileSync(KEY_FILE, "utf8").trim());
    const generated = randomBytes(32).toString("base64");
    mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, generated, { mode: 0o600 });
    return toKeyBuffer(generated);
  } catch (err) {
    throw new Error(
      `No ENCRYPTION_KEY and could not create a local key file (${String(err)}). Set ENCRYPTION_KEY in your environment.`,
    );
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, ivB64, tagB64, ctB64] = stored.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  try {
    key(); // env, existing file, or freshly generated — all count as configured
    return true;
  } catch {
    return false;
  }
}

/** Last-4 / masked preview for showing a stored key in the UI without revealing it. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}

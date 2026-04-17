import crypto from "crypto";

const IV_LENGTH_BYTES = 12; // Recommended length for AES-GCM
const AUTH_TAG_LENGTH_BYTES = 16;

function loadSsnKey(): Buffer {
  const raw = process.env.SSN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing required env var SSN_ENCRYPTION_KEY");
  }

  // Accept either 64-char hex (32 bytes) or base64 (32 bytes -> 44 chars w/ padding).
  const trimmed = raw.trim();
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    key = Buffer.from(trimmed, "base64");
  }

  if (key.length !== 32) {
    throw new Error("SSN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256 key)");
  }

  return key;
}

/**
 * Encrypts an SSN for storage-at-rest using AES-256-GCM.
 * Format: `${ivBase64}:${ciphertextAndTagBase64}` where ciphertextAndTag is (ciphertext || authTag).
 */
export function encryptSSN(ssn: string): string {
  const key = loadSsnKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([cipher.update(ssn, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([ciphertext, tag]);
  return `${iv.toString("base64")}:${payload.toString("base64")}`;
}

/**
 * Decrypts an SSN read from storage-at-rest.
 * Expects format `${ivBase64}:${ciphertextAndTagBase64}` where ciphertextAndTag is (ciphertext || authTag).
 */
export function decryptSSN(encrypted: string): string {
  const key = loadSsnKey();
  const parts = encrypted.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted SSN format");
  }

  const [ivB64, payloadB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const payload = Buffer.from(payloadB64, "base64");

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error("Invalid encrypted SSN IV length");
  }
  if (payload.length <= AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Invalid encrypted SSN payload length");
  }

  const ciphertext = payload.subarray(0, payload.length - AUTH_TAG_LENGTH_BYTES);
  const tag = payload.subarray(payload.length - AUTH_TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

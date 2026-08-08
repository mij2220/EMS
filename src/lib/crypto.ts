import crypto from "crypto";

// Derives a stable 32-byte key from JWT_SECRET rather than requiring a
// separate env var — keeps deployment simple (one less secret to manage
// across local/.env and Railway), at the cost of coupling credential
// encryption to the same secret used for sessions. Acceptable for this
// app's scope; a larger production system would want a dedicated key.
function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as iv (12 bytes) + authTag (16 bytes) + ciphertext, all in one blob
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptSecret(blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const encrypted = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

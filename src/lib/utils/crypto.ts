import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * 加密 API Key（AES-256-GCM）
 * 未設定 ENCRYPTION_KEY 時不加密（開發環境）
 */
export function encryptApiKey(plaintext: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) return plaintext;
  const keyBuffer = Buffer.from(key.slice(0, 32), "utf-8");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * 解密 API Key（AES-256-GCM）
 * 未設定 ENCRYPTION_KEY 或非加密格式時直接回傳原文
 */
export function decryptApiKey(ciphertext: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [ivHex, authTagHex, encrypted] = parts;
  const keyBuffer = Buffer.from(key.slice(0, 32), "utf-8");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    keyBuffer,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

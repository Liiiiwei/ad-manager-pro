import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256 需要 32 bytes 金鑰

/**
 * 從 ENCRYPTION_KEY 載入金鑰
 * - production：必須是 64 字元 hex（`openssl rand -hex 32`）；缺失或格式錯誤直接 throw
 * - 非 production 且未設定：回 null（明文 dev 模式，僅供本機）
 * - 非 production 且非 hex：容許 utf-8 slice fallback（測試/向下相容）
 */
function loadKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProd) {
      throw new Error(
        "ENCRYPTION_KEY 未設定：production 必須提供 64 字元 hex（產生：openssl rand -hex 32）",
      );
    }
    return null;
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (isProd) {
    throw new Error(
      "ENCRYPTION_KEY 格式錯誤：必須是 64 字元 hex（產生：openssl rand -hex 32）",
    );
  }

  if (raw.length >= KEY_BYTES) {
    return Buffer.from(raw.slice(0, KEY_BYTES), "utf-8");
  }
  return null;
}

/**
 * 加密 API Key（AES-256-GCM）
 * dev 環境未設 ENCRYPTION_KEY 時回原文
 */
export function encryptApiKey(plaintext: string): string {
  const keyBuffer = loadKey();
  if (!keyBuffer) return plaintext;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * 解密 API Key（AES-256-GCM）
 * dev 環境未設 ENCRYPTION_KEY 時回原文
 * 非加密格式（無冒號分隔）視為明文 dev 殘留資料
 */
export function decryptApiKey(ciphertext: string): string {
  const keyBuffer = loadKey();
  if (!keyBuffer) return ciphertext;

  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [ivHex, authTagHex, encrypted] = parts;

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

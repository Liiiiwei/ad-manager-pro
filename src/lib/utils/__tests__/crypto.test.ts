import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encryptApiKey, decryptApiKey } from "../crypto";

// 測試使用的合法 64 字元 hex（AES-256 金鑰）
const HEX_KEY_64 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// NODE_ENV 在 TS 型別上是 readonly，需要 vi.stubEnv 才能在測試中切換
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    vi.stubEnv(key, "");
    // stubEnv 不支援 delete，用空字串模擬「未設定」(crypto.ts loadKey 用 !raw 判斷)
  } else {
    vi.stubEnv(key, value);
  }
}

describe("encryptApiKey / decryptApiKey", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("加密後解密回傳原始字串（hex 64 字元金鑰）", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);
    const plaintext = "my-secret-api-key-12345";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("非 production 未設定 ENCRYPTION_KEY 時回傳原文不加密", () => {
    setEnv("ENCRYPTION_KEY", undefined);
    setEnv("NODE_ENV", "development");
    const plaintext = "my-secret-api-key";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).toBe(plaintext);
  });

  it("非 production 且非 hex 金鑰長度足 32 時回原文（utf-8 fallback）", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ENCRYPTION_KEY", "12345678901234567890123456789012"); // 32 字元 utf-8
    const plaintext = "my-secret-api-key";

    const encrypted = encryptApiKey(plaintext);
    // utf-8 fallback 模式應該真的有加密
    expect(encrypted).not.toBe(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("非 production 且金鑰長度不足 32 時回傳原文不加密", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ENCRYPTION_KEY", "short-key");
    const plaintext = "my-secret-api-key";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).toBe(plaintext);
  });

  it("production 未設定 ENCRYPTION_KEY 時 encrypt 直接 throw", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ENCRYPTION_KEY", undefined);

    expect(() => encryptApiKey("anything")).toThrow(/ENCRYPTION_KEY 未設定/);
  });

  it("production 未設定 ENCRYPTION_KEY 時 decrypt 直接 throw", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ENCRYPTION_KEY", undefined);

    expect(() => decryptApiKey("anything")).toThrow(/ENCRYPTION_KEY 未設定/);
  });

  it("production 金鑰非 64 字元 hex 時 encrypt 直接 throw", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ENCRYPTION_KEY", "12345678901234567890123456789012"); // utf-8 32 字元

    expect(() => encryptApiKey("anything")).toThrow(/ENCRYPTION_KEY 格式錯誤/);
  });

  it("production 金鑰非 64 字元 hex 時 decrypt 直接 throw", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ENCRYPTION_KEY", "not-a-hex-key");

    expect(() => decryptApiKey("anything")).toThrow(/ENCRYPTION_KEY 格式錯誤/);
  });

  it("非 production 未設定 ENCRYPTION_KEY 時 decrypt 直接回原文", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ENCRYPTION_KEY", undefined);
    const text = "some-text";

    const result = decryptApiKey(text);
    expect(result).toBe(text);
  });

  it("非加密格式的字串傳入 decrypt 時直接回傳", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);
    const plaintext = "not-encrypted-text";

    // 沒有冒號分隔，不是加密格式（需要 3 段）
    const result = decryptApiKey(plaintext);
    expect(result).toBe(plaintext);
  });

  it("不同輸入產生不同密文", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);

    const encrypted1 = encryptApiKey("secret-1");
    const encrypted2 = encryptApiKey("secret-2");

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("同一輸入每次加密產生不同密文（隨機 IV）", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);
    const plaintext = "same-input";

    const encrypted1 = encryptApiKey(plaintext);
    const encrypted2 = encryptApiKey(plaintext);

    expect(encrypted1).not.toBe(encrypted2);

    // 但兩者都能正確解密
    expect(decryptApiKey(encrypted1)).toBe(plaintext);
    expect(decryptApiKey(encrypted2)).toBe(plaintext);
  });

  it("空字串加密後解密回傳空字串", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);

    const encrypted = encryptApiKey("");
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe("");
  });

  it("加密格式為 iv:authTag:encrypted", () => {
    setEnv("ENCRYPTION_KEY", HEX_KEY_64);

    const encrypted = encryptApiKey("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
  });

  it("hex 金鑰 vs utf-8 fallback 產生的密文無法互通解密", () => {
    setEnv("NODE_ENV", "development");

    setEnv("ENCRYPTION_KEY", HEX_KEY_64);
    const cipher = encryptApiKey("payload");

    // 切換成 utf-8 fallback 金鑰
    setEnv("ENCRYPTION_KEY", "12345678901234567890123456789012");

    // 不同金鑰解密應該 throw（GCM authTag 驗不過）
    expect(() => decryptApiKey(cipher)).toThrow();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptApiKey, decryptApiKey } from "../crypto";

describe("encryptApiKey / decryptApiKey", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // 隔離環境變數
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("加密後解密回傳原始字串", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012"; // 32 字元
    const plaintext = "my-secret-api-key-12345";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("未設定 ENCRYPTION_KEY 時回傳原文不加密", () => {
    delete process.env.ENCRYPTION_KEY;
    const plaintext = "my-secret-api-key";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).toBe(plaintext);
  });

  it("ENCRYPTION_KEY 長度不足 32 時回傳原文不加密", () => {
    process.env.ENCRYPTION_KEY = "short-key";
    const plaintext = "my-secret-api-key";

    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).toBe(plaintext);
  });

  it("未設定 ENCRYPTION_KEY 時解密直接回傳原文", () => {
    delete process.env.ENCRYPTION_KEY;
    const text = "some-text";

    const result = decryptApiKey(text);
    expect(result).toBe(text);
  });

  it("非加密格式的字串傳入 decrypt 時直接回傳", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";
    const plaintext = "not-encrypted-text";

    // 沒有冒號分隔，不是加密格式（需要 3 段）
    const result = decryptApiKey(plaintext);
    expect(result).toBe(plaintext);
  });

  it("不同輸入產生不同密文", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";

    const encrypted1 = encryptApiKey("secret-1");
    const encrypted2 = encryptApiKey("secret-2");

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("同一輸入每次加密產生不同密文（隨機 IV）", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";
    const plaintext = "same-input";

    const encrypted1 = encryptApiKey(plaintext);
    const encrypted2 = encryptApiKey(plaintext);

    expect(encrypted1).not.toBe(encrypted2);

    // 但兩者都能正確解密
    expect(decryptApiKey(encrypted1)).toBe(plaintext);
    expect(decryptApiKey(encrypted2)).toBe(plaintext);
  });

  it("空字串加密後解密回傳空字串", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";

    const encrypted = encryptApiKey("");
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe("");
  });

  it("加密格式為 iv:authTag:encrypted", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";

    const encrypted = encryptApiKey("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
  });
});

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDatabaseUrl,
  generateEncryptionKey,
  isDbInitialised,
  parseEnvFile,
  serializeEnvFile,
  buildEnvLocalContent,
  buildChildEnv,
} from "../config.mjs";

describe("buildDatabaseUrl", () => {
  it("組出預設本機連線字串（埠 5433）", () => {
    expect(buildDatabaseUrl()).toBe(
      "postgresql://postgres:postgres@localhost:5433/ad_manager_pro?schema=public",
    );
  });
});

describe("generateEncryptionKey", () => {
  it("回傳 64 字元 hex", () => {
    expect(generateEncryptionKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isDbInitialised", () => {
  it("目錄有 PG_VERSION 才判為已初始化", () => {
    const dir = mkdtempSync(join(tmpdir(), "db-"));
    expect(isDbInitialised(dir)).toBe(false);
    writeFileSync(join(dir, "PG_VERSION"), "16");
    expect(isDbInitialised(dir)).toBe(true);
  });
});

describe("parseEnvFile / serializeEnvFile", () => {
  it("忽略註解與空行", () => {
    expect(parseEnvFile("# 註解\n\nA=1\nB=two\n")).toEqual({
      A: "1",
      B: "two",
    });
  });
  it("round-trip 一致", () => {
    expect(parseEnvFile(serializeEnvFile({ A: "1", B: "2" }))).toEqual({
      A: "1",
      B: "2",
    });
  });
});

describe("buildEnvLocalContent", () => {
  it("沒有既有金鑰時產生一組並帶入本機固定值", () => {
    const parsed = parseEnvFile(buildEnvLocalContent("", {}));
    expect(parsed.ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.LOCAL_NO_AUTH).toBe("true");
    expect(parsed.ENABLE_LINE_CRON).toBe("false");
    expect(parsed.DATABASE_URL).toContain("5433");
  });
  it("保留既有 ENCRYPTION_KEY（冪等，重跑不換金鑰）", () => {
    const first = buildEnvLocalContent("", {});
    const key = parseEnvFile(first).ENCRYPTION_KEY;
    const second = buildEnvLocalContent(first, {});
    expect(parseEnvFile(second).ENCRYPTION_KEY).toBe(key);
  });
});

describe("buildChildEnv", () => {
  it("用 envLocal 覆蓋 base", () => {
    expect(buildChildEnv({ A: "1", B: "2" }, { B: "x", C: "y" })).toEqual({
      A: "1",
      B: "x",
      C: "y",
    });
  });
});

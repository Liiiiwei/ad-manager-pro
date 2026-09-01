import { describe, it, expect, afterEach, vi } from "vitest";
import { isAuthBypassEnabled } from "../env";

describe("isAuthBypassEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("開發環境（NODE_ENV=development）回 true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_NO_AUTH", "");
    expect(isAuthBypassEnabled()).toBe(true);
  });

  it("production 且未設 LOCAL_NO_AUTH：回 false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "");
    expect(isAuthBypassEnabled()).toBe(false);
  });

  it("production 但 LOCAL_NO_AUTH=true：回 true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "true");
    expect(isAuthBypassEnabled()).toBe(true);
  });
});

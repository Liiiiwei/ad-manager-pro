import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("第一次請求應該被允許", () => {
    const result = checkRateLimit("test-user-1", {
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("未超過限制的請求都應被允許", () => {
    const config = { maxRequests: 3, windowMs: 60_000 };
    const id = "test-user-2";

    const r1 = checkRateLimit(id, config);
    const r2 = checkRateLimit(id, config);
    const r3 = checkRateLimit(id, config);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("超過限制的請求應被阻擋", () => {
    const config = { maxRequests: 2, windowMs: 60_000 };
    const id = "test-user-3";

    checkRateLimit(id, config);
    checkRateLimit(id, config);
    const blocked = checkRateLimit(id, config);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("視窗過期後應重置計數", () => {
    const config = { maxRequests: 1, windowMs: 10_000 };
    const id = "test-user-4";

    const r1 = checkRateLimit(id, config);
    expect(r1.allowed).toBe(true);

    const r2 = checkRateLimit(id, config);
    expect(r2.allowed).toBe(false);

    // 快轉超過視窗時間
    vi.advanceTimersByTime(11_000);

    const r3 = checkRateLimit(id, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0); // maxRequests=1, count=1, remaining=0
  });

  it("不同識別碼互不影響", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    checkRateLimit("user-a", config);
    const resultB = checkRateLimit("user-b", config);

    expect(resultB.allowed).toBe(true);
  });

  it("回傳正確的 resetTime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const config = { maxRequests: 10, windowMs: 30_000 };

    const result = checkRateLimit("test-user-5", config);
    expect(result.resetTime).toBe(Date.now() + 30_000);
  });
});

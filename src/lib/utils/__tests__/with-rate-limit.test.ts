import { describe, it, expect, beforeEach } from "vitest";
import { withRateLimit } from "../with-rate-limit";
import { _resetRateLimitForTest } from "../rate-limit";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
  });
}

describe("withRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTest();
  });

  it("第一個請求放行（無 identifier 時走 IP 路徑）", () => {
    const res = withRateLimit(makeReq({ "x-real-ip": "1.1.1.1" }), {
      maxRequests: 2,
      windowMs: 60_000,
    });
    expect(res).toBeNull();
  });

  it("超過上限時回 429 + Retry-After header", async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    const headers = { "x-real-ip": "2.2.2.2" };

    expect(withRateLimit(makeReq(headers), config)).toBeNull();
    const blocked = withRateLimit(makeReq(headers), config);

    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBeTruthy();
    expect(blocked!.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("傳入 identifier=user.id 時，相同 IP 但不同 user 互不干擾", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    const headers = { "x-real-ip": "3.3.3.3" };

    expect(
      withRateLimit(makeReq(headers), config, { identifier: "user-A" }),
    ).toBeNull();
    expect(
      withRateLimit(makeReq(headers), config, { identifier: "user-B" }),
    ).toBeNull();
    // user-A 第二次該被擋
    expect(
      withRateLimit(makeReq(headers), config, { identifier: "user-A" }),
    ).not.toBeNull();
    // user-B 第二次也該被擋
    expect(
      withRateLimit(makeReq(headers), config, { identifier: "user-B" }),
    ).not.toBeNull();
  });

  it("user bucket 與 ip bucket 互不干擾", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    const headers = { "x-real-ip": "4.4.4.4" };

    expect(
      withRateLimit(makeReq(headers), config, { identifier: "user-X" }),
    ).toBeNull();
    // 同 IP 走 ip bucket，第一次仍應放行
    expect(withRateLimit(makeReq(headers), config)).toBeNull();
  });

  it("有 x-real-ip 時優先採用，忽略可被偽造的 x-forwarded-for", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    expect(
      withRateLimit(
        makeReq({
          "x-real-ip": "5.5.5.5",
          "x-forwarded-for": "1.2.3.4, 5.5.5.5",
        }),
        config,
      ),
    ).toBeNull();
    // 同個 real-ip 第二次該擋
    expect(
      withRateLimit(makeReq({ "x-real-ip": "5.5.5.5" }), config),
    ).not.toBeNull();
  });

  it("無 x-real-ip 時，取 x-forwarded-for 最後一段（最接近 proxy）", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    expect(
      withRateLimit(
        makeReq({ "x-forwarded-for": "spoofed-1, spoofed-2, real-proxy" }),
        config,
      ),
    ).toBeNull();
    // 同最後一段 real-proxy，再請求應該被擋
    expect(
      withRateLimit(
        makeReq({ "x-forwarded-for": "different-spoof, real-proxy" }),
        config,
      ),
    ).not.toBeNull();
    // 不同最後一段，仍應放行
    expect(
      withRateLimit(makeReq({ "x-forwarded-for": "other-proxy" }), config),
    ).toBeNull();
  });

  it("無任何 IP header 時退回 ip:unknown bucket", () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    expect(withRateLimit(makeReq(), config)).toBeNull();
    expect(withRateLimit(makeReq(), config)).not.toBeNull();
  });
});

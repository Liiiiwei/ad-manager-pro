import { describe, it, expect, vi } from "vitest";
import { APIErrorCode, APIResponseError } from "@notionhq/client";
import { withNotionThrottle } from "../client";

/** 建構真實 APIResponseError（isNotionClientError 是 instanceof 檢查） */
function apiError(
  code: APIErrorCode,
  status: number,
  headers: Headers = new Headers(),
): APIResponseError {
  return new APIResponseError({
    code,
    status,
    message: `mock ${code}`,
    headers,
    rawBodyText: "",
    additional_data: undefined,
    request_id: undefined,
  });
}

// 用真實 timer：呼叫數少、單測皆 < 2 秒，比 fake timer 驅動 promise 鏈可靠

describe("withNotionThrottle", () => {
  it("全域串行且呼叫間隔 >= 350ms", async () => {
    const calledAt: number[] = [];
    const fn = vi.fn(async () => {
      calledAt.push(Date.now());
      return "ok";
    });
    const results = await Promise.all([
      withNotionThrottle(fn),
      withNotionThrottle(fn),
      withNotionThrottle(fn),
    ]);
    expect(results).toEqual(["ok", "ok", "ok"]);
    expect(calledAt).toHaveLength(3);
    // 容忍 timer 些微提早觸發的誤差
    expect(calledAt[1] - calledAt[0]).toBeGreaterThanOrEqual(340);
    expect(calledAt[2] - calledAt[1]).toBeGreaterThanOrEqual(340);
  });

  it("429 → 依 Retry-After 等待後重試一次並成功", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        apiError(
          APIErrorCode.RateLimited,
          429,
          new Headers({ "retry-after": "0" }),
        ),
      )
      .mockResolvedValueOnce("recovered");
    await expect(withNotionThrottle(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("429 重試仍 429 → 只重試一次，原樣拋出", async () => {
    const err = apiError(
      APIErrorCode.RateLimited,
      429,
      new Headers({ "retry-after": "0" }),
    );
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);
    await expect(withNotionThrottle(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("5xx → 等待後重試一次", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(apiError(APIErrorCode.ServiceUnavailable, 503))
      .mockResolvedValueOnce("recovered");
    await expect(withNotionThrottle(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("其他錯誤（如 validation_error）→ 不重試、立即拋出", async () => {
    const err = apiError(APIErrorCode.ValidationError, 400);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);
    await expect(withNotionThrottle(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("一次失敗不會讓後續排隊的呼叫連鎖失敗", async () => {
    const err = apiError(APIErrorCode.ValidationError, 400);
    const failing = withNotionThrottle(() => Promise.reject(err));
    const following = withNotionThrottle(async () => "still-works");
    await expect(failing).rejects.toBe(err);
    await expect(following).resolves.toBe("still-works");
  });
});

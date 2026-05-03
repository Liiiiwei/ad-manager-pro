import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWindsor, testApiKey, WindsorApiError } from "../client";

// mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// mock zod parse 和 normalizeRecord — 直接 mock types 模組
vi.mock("../types", async (importOriginal) => {
  const original = await importOriginal<typeof import("../types")>();
  return {
    ...original,
    windsorResponseSchema: {
      parse: (data: unknown) => data,
    },
    normalizeRecord: (r: unknown) => r,
  };
});

describe("fetchWindsor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("建構正確的 URL 包含所有參數", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: {} }),
    });

    await fetchWindsor("test-key", {
      connector: "facebook",
      fields: ["spend", "clicks"],
      date_preset: "last_7d",
      date_aggregation: "day",
      filter: "campaign=test",
      _max_rows: 100,
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.origin + url.pathname).toBe(
      "https://connectors.windsor.ai/facebook",
    );
    expect(url.searchParams.get("api_key")).toBe("test-key");
    expect(url.searchParams.get("fields")).toBe("spend,clicks");
    expect(url.searchParams.get("date_preset")).toBe("last_7d");
    expect(url.searchParams.get("date_aggregation")).toBe("day");
    expect(url.searchParams.get("filter")).toBe("campaign=test");
    expect(url.searchParams.get("_max_rows")).toBe("100");
  });

  it("可選參數不存在時不加入 URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: {} }),
    });

    await fetchWindsor("key", {
      connector: "google_ads",
      fields: ["spend"],
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.searchParams.has("date_preset")).toBe(false);
    expect(url.searchParams.has("date_from")).toBe(false);
    expect(url.searchParams.has("date_to")).toBe(false);
    expect(url.searchParams.has("date_aggregation")).toBe(false);
    expect(url.searchParams.has("filter")).toBe(false);
    expect(url.searchParams.has("_max_rows")).toBe(false);
  });

  it("包含 date_from 和 date_to 參數", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: {} }),
    });

    await fetchWindsor("key", {
      connector: "facebook",
      fields: ["spend"],
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.searchParams.get("date_from")).toBe("2026-01-01");
    expect(url.searchParams.get("date_to")).toBe("2026-01-31");
  });

  it("API 回傳錯誤時拋出 WindsorApiError", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      fetchWindsor("bad-key", {
        connector: "facebook",
        fields: ["spend"],
      }),
    ).rejects.toThrow(WindsorApiError);
  });

  it("WindsorApiError 包含正確的 status 和 body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    try {
      await fetchWindsor("key", {
        connector: "facebook",
        fields: ["spend"],
      });
    } catch (e) {
      expect(e).toBeInstanceOf(WindsorApiError);
      expect((e as WindsorApiError).status).toBe(500);
      expect((e as WindsorApiError).body).toBe("Internal Server Error");
    }
  });
});

describe("testApiKey", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("API Key 有效時回傳 true", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const result = await testApiKey("valid-key");
    expect(result).toBe(true);
  });

  it("API Key 無效時回傳 false", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await testApiKey("invalid-key");
    expect(result).toBe(false);
  });

  it("網路錯誤時回傳 false", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const result = await testApiKey("any-key");
    expect(result).toBe(false);
  });

  it("呼叫正確的 URL", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await testApiKey("my-key");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://connectors.windsor.ai/list_connectors?api_key=my-key",
    );
  });
});

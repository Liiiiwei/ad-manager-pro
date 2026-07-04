import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pushLineMessage, pushText, pushFlex } from "../client";

describe("pushLineMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時以正確 URL、Authorization 與 body 呼叫並回傳 ok", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await pushLineMessage("token-123", "U456", [
      { type: "text", text: "哈囉" },
    ]);

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer token-123");
    expect(JSON.parse(init.body)).toEqual({
      to: "U456",
      messages: [{ type: "text", text: "哈囉" }],
    });
  });

  it("4xx 回應時回傳 ok:false 與狀態碼、錯誤內文，不 throw", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"message":"Invalid recipient"}'),
    });

    const result = await pushLineMessage("token", "bad-id", [
      { type: "text", text: "x" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("Invalid recipient");
  });

  it("429 限流回應時回傳 ok:false 且 status 429", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    });

    const result = await pushLineMessage("token", "U1", [
      { type: "text", text: "x" },
    ]);

    expect(result).toEqual({ ok: false, status: 429, error: "rate limited" });
  });

  it("網路錯誤（fetch reject）時回傳 ok:false，不 throw", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await pushLineMessage("token", "U1", [
      { type: "text", text: "x" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});

describe("pushText / pushFlex", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushText 組出 text 訊息", async () => {
    await pushText("token", "U1", "測試文字");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ type: "text", text: "測試文字" }]);
  });

  it("pushFlex 組出 flex 訊息（altText 必填）", async () => {
    const bubble = { type: "bubble", body: { type: "box" } };
    await pushFlex("token", "U1", bubble, "摘要通知");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { type: "flex", altText: "摘要通知", contents: bubble },
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { alertStableKey } from "../alert-key";
import type { Alert } from "../types";

// 產生一個基準 Alert，只覆寫測試關心的欄位
function makeAlert(overrides: Partial<Alert>): Alert {
  return {
    id: "random-id",
    category: "performance",
    severity: "warning",
    title: "標題",
    description: "描述",
    metric: "roas",
    currentValue: 1,
    previousValue: 2,
    changePercent: -50,
    platform: "meta",
    accountName: "帳號 A",
    campaignName: "活動 1",
    detectedAt: "2026-09-01",
    recommendation: "建議",
    ...overrides,
  };
}

describe("alertStableKey", () => {
  it("同內容但隨機 id／嚴重度／偵測日期不同時，仍產生相同鍵（跨重算穩定）", () => {
    const a = makeAlert({
      id: "x1",
      detectedAt: "2026-09-01",
      severity: "warning",
    });
    const b = makeAlert({
      id: "x2",
      detectedAt: "2026-09-02",
      severity: "critical",
    });
    expect(alertStableKey(a)).toBe(alertStableKey(b));
  });

  it("類別不同 → 鍵不同", () => {
    expect(alertStableKey(makeAlert({ category: "budget" }))).not.toBe(
      alertStableKey(makeAlert({ category: "performance" })),
    );
  });

  it("指標不同 → 鍵不同", () => {
    expect(alertStableKey(makeAlert({ metric: "cpc" }))).not.toBe(
      alertStableKey(makeAlert({ metric: "cpm" })),
    );
  });

  it("帳號不同 → 鍵不同", () => {
    expect(alertStableKey(makeAlert({ accountName: "A" }))).not.toBe(
      alertStableKey(makeAlert({ accountName: "B" })),
    );
  });

  it("活動名與廣告組名錯位不會碰撞（欄位位置有意義）", () => {
    const x = alertStableKey(
      makeAlert({ campaignName: "A", adsetName: undefined, adName: undefined }),
    );
    const y = alertStableKey(
      makeAlert({ campaignName: undefined, adsetName: "A", adName: undefined }),
    );
    expect(x).not.toBe(y);
  });

  it("缺帳號（全帳號層級）也能穩定產鍵，且不含字面 undefined", () => {
    const args = { accountName: undefined, campaignName: undefined };
    const k = alertStableKey(makeAlert(args));
    expect(k).not.toContain("undefined");
    expect(k).toBe(alertStableKey(makeAlert(args)));
  });
});

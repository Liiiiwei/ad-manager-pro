import { describe, it, expect } from "vitest";
import { detectBudgetAnomalies } from "../budget-anomaly";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AnalysisThresholds } from "../types";

function makeRecord(
  overrides: Partial<WindsorAdRecord> & { date: string },
): WindsorAdRecord {
  return {
    source: "facebook",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset: "測試廣告組",
    ad_name: "測試廣告",
    spend: 100,
    impressions: 1000,
    clicks: 50,
    conversions: 5,
    revenue: 500,
    frequency: 1.5,
    cpc: 2,
    cpm: 100,
    ctr: 5,
    roas: 5,
    purchases: 5,
    addToCart: 10,
    initiateCheckout: 8,
    leads: 3,
    purchaseValue: 500,
    addToCartValue: 300,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

const defaultThresholds: AnalysisThresholds["budget"] = {
  cpcSpikePercent: 50,
  cpmSpikePercent: 40,
};

describe("detectBudgetAnomalies", () => {
  it("空資料回傳空陣列", () => {
    const alerts = detectBudgetAnomalies([], defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("只有 1 筆資料時不產生警示", () => {
    const data = [makeRecord({ date: "2026-01-01" })];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("CPC 暴漲超過門檻時產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", cpc: 2 }),
      makeRecord({ date: "2026-01-02", cpc: 2 }),
      makeRecord({ date: "2026-01-03", cpc: 2 }),
      makeRecord({ date: "2026-01-04", cpc: 5 }), // 150% 漲幅
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    const cpcAlerts = alerts.filter((a) => a.metric === "cpc");
    expect(cpcAlerts).toHaveLength(1);
    expect(cpcAlerts[0].severity).toBe("warning");
    expect(cpcAlerts[0].title).toContain("CPC 暴漲");
  });

  it("CPC 微幅上升時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", cpc: 2 }),
      makeRecord({ date: "2026-01-02", cpc: 2 }),
      makeRecord({ date: "2026-01-03", cpc: 2.5 }), // 25% 漲幅，低於 50% 門檻
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    const cpcAlerts = alerts.filter((a) => a.metric === "cpc");
    expect(cpcAlerts).toHaveLength(0);
  });

  it("CPM 暴漲超過門檻時產生 info 警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", cpm: 100 }),
      makeRecord({ date: "2026-01-02", cpm: 100 }),
      makeRecord({ date: "2026-01-03", cpm: 200 }), // 100% 漲幅
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    const cpmAlerts = alerts.filter((a) => a.metric === "cpm");
    expect(cpmAlerts).toHaveLength(1);
    expect(cpmAlerts[0].severity).toBe("info");
  });

  it("CPC 為 0 時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", cpc: 0 }),
      makeRecord({ date: "2026-01-02", cpc: 0 }),
      makeRecord({ date: "2026-01-03", cpc: 0 }),
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    const cpcAlerts = alerts.filter((a) => a.metric === "cpc");
    expect(cpcAlerts).toHaveLength(0);
  });

  it("不同 campaign 分開偵測", () => {
    const data = [
      makeRecord({ date: "2026-01-01", campaign: "A", cpc: 2 }),
      makeRecord({ date: "2026-01-02", campaign: "A", cpc: 10 }),
      makeRecord({ date: "2026-01-01", campaign: "B", cpc: 2 }),
      makeRecord({ date: "2026-01-02", campaign: "B", cpc: 2 }),
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    const campaignNames = alerts.map((a) => a.campaignName);
    expect(campaignNames).toContain("A");
    expect(campaignNames).not.toContain("B");
  });

  it("Google 來源正確辨識為 google 平台", () => {
    const data = [
      makeRecord({ date: "2026-01-01", source: "google_ads", cpc: 2 }),
      makeRecord({ date: "2026-01-02", source: "google_ads", cpc: 10 }),
    ];
    const alerts = detectBudgetAnomalies(data, defaultThresholds);
    expect(alerts[0].platform).toBe("google");
  });
});

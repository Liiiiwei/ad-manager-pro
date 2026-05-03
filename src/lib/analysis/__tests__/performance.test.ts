import { describe, it, expect } from "vitest";
import { detectPerformanceDecline } from "../performance";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AnalysisThresholds } from "../types";

// 建立測試用的 WindsorAdRecord
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
    ...overrides,
  };
}

const defaultThresholds: AnalysisThresholds["performance"] = {
  ctrDropPercent: 20,
  convRateDropPercent: 30,
  roasDropPercent: 25,
  roasMinThreshold: 1.0,
};

describe("detectPerformanceDecline", () => {
  it("資料少於 4 筆時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01" }),
      makeRecord({ date: "2026-01-02" }),
      makeRecord({ date: "2026-01-03" }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("空資料回傳空陣列", () => {
    const alerts = detectPerformanceDecline([], defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("CTR 大幅下降時產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", ctr: 5 }),
      makeRecord({ date: "2026-01-02", ctr: 5 }),
      makeRecord({ date: "2026-01-03", ctr: 2 }),
      makeRecord({ date: "2026-01-04", ctr: 2 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    const ctrAlerts = alerts.filter((a) => a.metric === "ctr");
    expect(ctrAlerts.length).toBeGreaterThanOrEqual(1);
    expect(ctrAlerts[0].severity).toBe("warning");
    expect(ctrAlerts[0].category).toBe("performance");
  });

  it("CTR 微幅下降時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", ctr: 5 }),
      makeRecord({ date: "2026-01-02", ctr: 5 }),
      makeRecord({ date: "2026-01-03", ctr: 4.5 }),
      makeRecord({ date: "2026-01-04", ctr: 4.5 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    const ctrAlerts = alerts.filter((a) => a.metric === "ctr");
    expect(ctrAlerts).toHaveLength(0);
  });

  it("ROAS 下降至虧損線以下時產生 critical 警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", roas: 3, spend: 100 }),
      makeRecord({ date: "2026-01-02", roas: 3, spend: 100 }),
      makeRecord({ date: "2026-01-03", roas: 0.5, spend: 100 }),
      makeRecord({ date: "2026-01-04", roas: 0.5, spend: 100 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    const roasAlerts = alerts.filter((a) => a.metric === "roas");
    expect(roasAlerts.some((a) => a.severity === "critical")).toBe(true);
  });

  it("轉換率下降時產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", clicks: 100, conversions: 10 }),
      makeRecord({ date: "2026-01-02", clicks: 100, conversions: 10 }),
      makeRecord({ date: "2026-01-03", clicks: 100, conversions: 2 }),
      makeRecord({ date: "2026-01-04", clicks: 100, conversions: 2 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    const convAlerts = alerts.filter((a) => a.metric === "conversion_rate");
    expect(convAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("正確辨識 Meta 平台", () => {
    const data = [
      makeRecord({ date: "2026-01-01", source: "facebook", ctr: 5 }),
      makeRecord({ date: "2026-01-02", source: "facebook", ctr: 5 }),
      makeRecord({ date: "2026-01-03", source: "facebook", ctr: 1 }),
      makeRecord({ date: "2026-01-04", source: "facebook", ctr: 1 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    expect(alerts[0].platform).toBe("meta");
  });

  it("正確辨識 Google 平台", () => {
    const data = [
      makeRecord({ date: "2026-01-01", source: "google_ads", ctr: 5 }),
      makeRecord({ date: "2026-01-02", source: "google_ads", ctr: 5 }),
      makeRecord({ date: "2026-01-03", source: "google_ads", ctr: 1 }),
      makeRecord({ date: "2026-01-04", source: "google_ads", ctr: 1 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    expect(alerts[0].platform).toBe("google");
  });

  it("不同 campaign 分開分析", () => {
    const data = [
      makeRecord({ date: "2026-01-01", campaign: "A", ctr: 5 }),
      makeRecord({ date: "2026-01-02", campaign: "A", ctr: 5 }),
      makeRecord({ date: "2026-01-03", campaign: "A", ctr: 1 }),
      makeRecord({ date: "2026-01-04", campaign: "A", ctr: 1 }),
      makeRecord({ date: "2026-01-01", campaign: "B", ctr: 5 }),
      makeRecord({ date: "2026-01-02", campaign: "B", ctr: 5 }),
      makeRecord({ date: "2026-01-03", campaign: "B", ctr: 5 }),
      makeRecord({ date: "2026-01-04", campaign: "B", ctr: 5 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    const campaignNames = alerts.map((a) => a.campaignName);
    expect(campaignNames).toContain("A");
    expect(campaignNames).not.toContain("B");
  });

  it("ROAS 低於虧損線但花費低於 50 時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", roas: 0.5, spend: 10 }),
      makeRecord({ date: "2026-01-02", roas: 0.5, spend: 10 }),
      makeRecord({ date: "2026-01-03", roas: 0.5, spend: 10 }),
      makeRecord({ date: "2026-01-04", roas: 0.5, spend: 10 }),
    ];
    const alerts = detectPerformanceDecline(data, defaultThresholds);
    // 只有 ROAS 下降警示（因為 prevRoas=0.5, currRoas=0.5 沒有下降）
    // 也不會有虧損線警示因為 totalSpend < 50
    const lossAlerts = alerts.filter((a) => a.title.includes("虧損線"));
    expect(lossAlerts).toHaveLength(0);
  });
});

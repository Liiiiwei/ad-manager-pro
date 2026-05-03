import { describe, it, expect } from "vitest";
import { generateRecommendations } from "../recommendations";
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
    roas: 3,
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

const defaultThresholds: AnalysisThresholds["recommendation"] = {
  scaleRoasMin: 3.0,
  killRoasMax: 0.8,
  minSpendForDecision: 100,
};

describe("generateRecommendations", () => {
  it("空資料回傳空陣列", () => {
    const alerts = generateRecommendations([], defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("花費低於門檻時不產生建議", () => {
    const data = [
      makeRecord({ date: "2026-01-01", spend: 30, roas: 5 }),
      makeRecord({ date: "2026-01-02", spend: 30, roas: 5 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("ROAS 高於擴量門檻時產生擴量建議", () => {
    const data = [
      makeRecord({ date: "2026-01-01", spend: 200, roas: 5 }),
      makeRecord({ date: "2026-01-02", spend: 200, roas: 5 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    const scaleAlerts = alerts.filter((a) => a.title.includes("擴量"));
    expect(scaleAlerts).toHaveLength(1);
    expect(scaleAlerts[0].severity).toBe("info");
  });

  it("ROAS 持續低於停止門檻且連續 3 天以上時產生停止建議", () => {
    const data = [
      makeRecord({ date: "2026-01-01", spend: 50, roas: 0.3 }),
      makeRecord({ date: "2026-01-02", spend: 50, roas: 0.5 }),
      makeRecord({ date: "2026-01-03", spend: 50, roas: 0.4 }),
      makeRecord({ date: "2026-01-04", spend: 50, roas: 0.2 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    const killAlerts = alerts.filter((a) => a.title.includes("停止"));
    expect(killAlerts).toHaveLength(1);
    expect(killAlerts[0].severity).toBe("critical");
  });

  it("ROAS 在中間地帶且有下滑趨勢時產生觀察建議", () => {
    const data = [
      makeRecord({ date: "2026-01-01", spend: 50, roas: 2.5 }),
      makeRecord({ date: "2026-01-02", spend: 50, roas: 2.5 }),
      makeRecord({ date: "2026-01-03", spend: 50, roas: 1.2 }),
      makeRecord({ date: "2026-01-04", spend: 50, roas: 1.0 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    const trendAlerts = alerts.filter((a) => a.title.includes("趨勢下滑"));
    expect(trendAlerts).toHaveLength(1);
    expect(trendAlerts[0].severity).toBe("warning");
  });

  it("ROAS 穩定在中間地帶且無下滑時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", spend: 50, roas: 1.5 }),
      makeRecord({ date: "2026-01-02", spend: 50, roas: 1.5 }),
      makeRecord({ date: "2026-01-03", spend: 50, roas: 1.5 }),
      makeRecord({ date: "2026-01-04", spend: 50, roas: 1.5 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    const trendAlerts = alerts.filter((a) => a.title.includes("趨勢下滑"));
    expect(trendAlerts).toHaveLength(0);
  });

  it("campaign 為空時分組到 unknown", () => {
    const data = [
      makeRecord({ date: "2026-01-01", campaign: "", spend: 200, roas: 5 }),
      makeRecord({ date: "2026-01-02", campaign: "", spend: 200, roas: 5 }),
    ];
    const alerts = generateRecommendations(data, defaultThresholds);
    const scaleAlerts = alerts.filter((a) => a.title.includes("擴量"));
    expect(scaleAlerts[0].campaignName).toBe("unknown");
  });
});

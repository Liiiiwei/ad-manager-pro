import { describe, it, expect } from "vitest";
import { detectCreativeFatigue } from "../creative-fatigue";
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
    frequency: 2,
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

const defaultThresholds: AnalysisThresholds["creative"] = {
  highFrequency: 3.0,
  ctrDeclinePercent: 20,
  fatigueWindowDays: 7,
};

describe("detectCreativeFatigue", () => {
  it("空資料回傳空陣列", () => {
    const alerts = detectCreativeFatigue([], defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("ad_name 為空時跳過", () => {
    const data = [
      makeRecord({ date: "2026-01-01", ad_name: "" }),
      makeRecord({ date: "2026-01-02", ad_name: "" }),
      makeRecord({ date: "2026-01-03", ad_name: "" }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("資料不足 3 筆時不產生警示", () => {
    const data = [
      makeRecord({ date: "2026-01-01", ad_name: "廣告A" }),
      makeRecord({ date: "2026-01-02", ad_name: "廣告A" }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("高頻率 + CTR 下降時產生 critical 警示", () => {
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告A",
        frequency: 4,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告A",
        frequency: 4.5,
        ctr: 4,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告A",
        frequency: 5,
        ctr: 3,
      }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].category).toBe("creative");
    expect(alerts[0].title).toContain("嚴重疲勞");
  });

  it("僅高頻率（CTR 未下降）時產生 warning 警示", () => {
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告B",
        frequency: 4,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告B",
        frequency: 4.5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告B",
        frequency: 5,
        ctr: 5,
      }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].title).toContain("頻率過高");
  });

  it("僅 CTR 下降（頻率正常）時產生 warning 警示", () => {
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告C",
        frequency: 1.5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告C",
        frequency: 1.5,
        ctr: 3,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告C",
        frequency: 1.5,
        ctr: 2,
      }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].title).toContain("CTR 持續走低");
  });

  it("頻率正常且 CTR 穩定時不產生警示", () => {
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告D",
        frequency: 1.5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告D",
        frequency: 1.5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告D",
        frequency: 1.5,
        ctr: 5,
      }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts).toHaveLength(0);
  });

  it("只取最近 fatigueWindowDays 天的資料", () => {
    // 前面的高頻率資料應被截斷，只看最近 3 天
    const thresholds = { ...defaultThresholds, fatigueWindowDays: 3 };
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告E",
        frequency: 5,
        ctr: 1,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告E",
        frequency: 5,
        ctr: 1,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告E",
        frequency: 1,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-04",
        ad_name: "廣告E",
        frequency: 1,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-05",
        ad_name: "廣告E",
        frequency: 1,
        ctr: 5,
      }),
    ];
    const alerts = detectCreativeFatigue(data, thresholds);
    // 最近 3 天頻率 1，CTR 5，不應產生警示
    expect(alerts).toHaveLength(0);
  });

  it("正確辨識 Instagram 來源為 meta", () => {
    const data = [
      makeRecord({
        date: "2026-01-01",
        ad_name: "廣告F",
        source: "instagram",
        frequency: 5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-02",
        ad_name: "廣告F",
        source: "instagram",
        frequency: 5,
        ctr: 5,
      }),
      makeRecord({
        date: "2026-01-03",
        ad_name: "廣告F",
        source: "instagram",
        frequency: 5,
        ctr: 5,
      }),
    ];
    const alerts = detectCreativeFatigue(data, defaultThresholds);
    expect(alerts[0].platform).toBe("meta");
  });
});

import { describe, it, expect } from "vitest";
import { runFullAnalysis } from "../engine";
import { DEFAULT_THRESHOLDS } from "../thresholds";
import type { WindsorAdRecord } from "@/lib/windsor/types";

// 建立測試用的廣告記錄
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2024-01-01",
    source: "meta",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset: "測試廣告組",
    ad_name: "測試廣告",
    spend: 100,
    impressions: 10000,
    clicks: 200,
    conversions: 10,
    revenue: 500,
    frequency: 1.5,
    cpc: 0.5,
    cpm: 10,
    ctr: 2.0,
    roas: 5.0,
    purchases: 10,
    addToCart: 20,
    initiateCheckout: 15,
    leads: 5,
    purchaseValue: 500,
    addToCartValue: 300,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    ...overrides,
  };
}

describe("runFullAnalysis", () => {
  it("完整分析回傳預期結構", () => {
    const data = [
      makeRecord({ date: "2024-01-01" }),
      makeRecord({ date: "2024-01-02" }),
    ];
    const result = runFullAnalysis(data);

    expect(result).toHaveProperty("generatedAt");
    expect(result).toHaveProperty("dateRange");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("alerts");
    expect(result).toHaveProperty("platformBreakdown");
    expect(result.dateRange).toHaveProperty("from");
    expect(result.dateRange).toHaveProperty("to");
    expect(result.platformBreakdown).toHaveProperty("meta");
    expect(result.platformBreakdown).toHaveProperty("google");
  });

  it("空資料不拋錯，回傳合理預設值", () => {
    const result = runFullAnalysis([]);

    expect(result.summary.totalSpend).toBe(0);
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.summary.overallRoas).toBe(0);
    expect(result.summary.totalConversions).toBe(0);
    expect(result.summary.avgCpc).toBe(0);
    expect(result.summary.avgCtr).toBe(0);
    expect(result.alerts).toEqual([]);
    expect(result.dateRange.from).toBe("");
    expect(result.dateRange.to).toBe("");
  });

  it("summary 正確計算花費與營收總計", () => {
    const data = [
      makeRecord({
        spend: 100,
        revenue: 300,
        clicks: 50,
        impressions: 5000,
        conversions: 5,
      }),
      makeRecord({
        spend: 200,
        revenue: 700,
        clicks: 100,
        impressions: 10000,
        conversions: 15,
      }),
    ];
    const result = runFullAnalysis(data);

    expect(result.summary.totalSpend).toBe(300);
    expect(result.summary.totalRevenue).toBe(1000);
    expect(result.summary.totalConversions).toBe(20);
  });

  it("ROAS 正確計算為 revenue / spend", () => {
    const data = [makeRecord({ spend: 200, revenue: 600 })];
    const result = runFullAnalysis(data);

    expect(result.summary.overallRoas).toBe(3); // 600 / 200
  });

  it("avgCpc 正確計算為 spend / clicks", () => {
    const data = [
      makeRecord({ spend: 100, clicks: 50 }),
      makeRecord({ spend: 200, clicks: 100 }),
    ];
    const result = runFullAnalysis(data);

    // totalSpend=300, totalClicks=150 → 300/150 = 2
    expect(result.summary.avgCpc).toBe(2);
  });

  it("avgCtr 正確計算為 (clicks / impressions) * 100", () => {
    const data = [
      makeRecord({ clicks: 100, impressions: 5000 }),
      makeRecord({ clicks: 200, impressions: 5000 }),
    ];
    const result = runFullAnalysis(data);

    // totalClicks=300, totalImpressions=10000 → (300/10000)*100 = 3%
    expect(result.summary.avgCtr).toBe(3);
  });

  it("日期範圍正確取最小與最大日期", () => {
    const data = [
      makeRecord({ date: "2024-01-05" }),
      makeRecord({ date: "2024-01-01" }),
      makeRecord({ date: "2024-01-10" }),
    ];
    const result = runFullAnalysis(data);

    expect(result.dateRange.from).toBe("2024-01-01");
    expect(result.dateRange.to).toBe("2024-01-10");
  });

  it("平台拆分正確區分 Meta 與 Google 資料", () => {
    const data = [
      makeRecord({ source: "facebook", spend: 100, revenue: 300 }),
      makeRecord({ source: "instagram", spend: 50, revenue: 150 }),
      makeRecord({ source: "google", spend: 200, revenue: 800 }),
    ];
    const result = runFullAnalysis(data);

    expect(result.platformBreakdown.meta.spend).toBe(150);
    expect(result.platformBreakdown.meta.revenue).toBe(450);
    expect(result.platformBreakdown.google.spend).toBe(200);
    expect(result.platformBreakdown.google.revenue).toBe(800);
  });

  it("spend 為 0 時 ROAS 回傳 0 而非除以零", () => {
    const data = [makeRecord({ spend: 0, revenue: 0 })];
    const result = runFullAnalysis(data);

    expect(result.summary.overallRoas).toBe(0);
    expect(Number.isFinite(result.summary.overallRoas)).toBe(true);
  });

  it("警報依嚴重性排序（critical 優先）", () => {
    // 製造大量資料使 performance decline 偵測觸發多種警報
    const data: WindsorAdRecord[] = [];
    // 前半段：表現好
    for (let i = 1; i <= 7; i++) {
      data.push(
        makeRecord({
          date: `2024-01-${String(i).padStart(2, "0")}`,
          ctr: 5.0,
          roas: 4.0,
          spend: 100,
          revenue: 400,
          clicks: 200,
          conversions: 20,
          impressions: 10000,
        }),
      );
    }
    // 後半段：表現急劇下降
    for (let i = 8; i <= 14; i++) {
      data.push(
        makeRecord({
          date: `2024-01-${String(i).padStart(2, "0")}`,
          ctr: 0.5,
          roas: 0.3,
          spend: 100,
          revenue: 30,
          clicks: 50,
          conversions: 1,
          impressions: 10000,
        }),
      );
    }

    const result = runFullAnalysis(data);

    if (result.alerts.length > 1) {
      const severityOrder: Record<string, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      for (let i = 1; i < result.alerts.length; i++) {
        const prev = severityOrder[result.alerts[i - 1].severity];
        const curr = severityOrder[result.alerts[i].severity];
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  it("自訂閾值覆蓋預設值", () => {
    // 使用極高的閾值確保不觸發任何警報
    const customThresholds = {
      ...DEFAULT_THRESHOLDS,
      budget: { cpcSpikePercent: 99999, cpmSpikePercent: 99999 },
      performance: {
        ctrDropPercent: 99999,
        convRateDropPercent: 99999,
        roasDropPercent: 99999,
        roasMinThreshold: 0,
      },
      creative: {
        highFrequency: 99999,
        ctrDeclinePercent: 99999,
        fatigueWindowDays: 99999,
      },
      recommendation: {
        scaleRoasMin: 99999,
        killRoasMax: 0,
        minSpendForDecision: 99999,
      },
    };

    const data: WindsorAdRecord[] = [];
    for (let i = 1; i <= 14; i++) {
      data.push(
        makeRecord({
          date: `2024-01-${String(i).padStart(2, "0")}`,
          ctr: i <= 7 ? 5.0 : 0.1,
          roas: i <= 7 ? 5.0 : 0.1,
        }),
      );
    }

    const result = runFullAnalysis(data, customThresholds);
    expect(result.alerts).toHaveLength(0);
  });
});

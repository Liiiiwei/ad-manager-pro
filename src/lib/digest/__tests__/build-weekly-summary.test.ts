import { describe, it, expect } from "vitest";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import { deriveWeekWindows, buildWeeklySummary } from "../build-weekly-summary";

/** 產生完整欄位的測試記錄（同 build-daily-summary 測試風格） */
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2026-07-01",
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
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

// 固定「今天」= 台北 2026-07-06 09:00 → 昨日 2026-07-05
// 本週窗口 2026-06-29 ~ 2026-07-05；上週 2026-06-22 ~ 2026-06-28
const NOW = new Date("2026-07-06T09:00:00+08:00");

describe("deriveWeekWindows", () => {
  it("以昨日為本週迄日，往前推兩個 7 天窗口（含頭尾）", () => {
    expect(deriveWeekWindows(NOW)).toEqual({
      weekStart: "2026-06-29",
      weekEnd: "2026-07-05",
      lastWeekStart: "2026-06-22",
      lastWeekEnd: "2026-06-28",
    });
  });

  it("跨月邊界：now=7/1 → 昨日 6/30，窗口正確回推到 6 月", () => {
    expect(deriveWeekWindows(new Date("2026-07-01T09:00:00+08:00"))).toEqual({
      weekStart: "2026-06-24",
      weekEnd: "2026-06-30",
      lastWeekStart: "2026-06-17",
      lastWeekEnd: "2026-06-23",
    });
  });
});

describe("buildWeeklySummary", () => {
  it("本週/上週總量與 WoW 正確計算", () => {
    const records = [
      // 本週（06-29 ~ 07-05）：spend 1000、revenue 3800、conv 40 → roas 3.8、cpa 25
      makeRecord({
        date: "2026-06-29",
        campaign: "AAA_夏季",
        spend: 600,
        revenue: 3000,
        conversions: 30,
      }),
      makeRecord({
        date: "2026-07-05",
        campaign: "BBB_促銷",
        spend: 400,
        revenue: 800,
        conversions: 10,
      }),
      // 上週（06-22 ~ 06-28）：spend 800、revenue 2400、conv 32 → roas 3、cpa 25
      makeRecord({
        date: "2026-06-25",
        campaign: "AAA_夏季",
        spend: 800,
        revenue: 2400,
        conversions: 32,
      }),
      // 窗口外（應被排除）
      makeRecord({ date: "2026-06-21", spend: 9999, revenue: 9999 }),
      makeRecord({ date: "2026-07-06", spend: 9999, revenue: 9999 }),
    ];

    const summary = buildWeeklySummary(records, { now: NOW });

    expect(summary.weekStart).toBe("2026-06-29");
    expect(summary.weekEnd).toBe("2026-07-05");

    expect(summary.thisWeek.spend).toBe(1000);
    expect(summary.thisWeek.revenue).toBe(3800);
    expect(summary.thisWeek.conversions).toBe(40);
    expect(summary.thisWeek.roas).toBeCloseTo(3.8);
    expect(summary.thisWeek.cpa).toBe(25);

    expect(summary.lastWeek.spend).toBe(800);
    expect(summary.lastWeek.roas).toBe(3);

    // WoW：花費 +25%、ROAS +26.67%、轉換 +25%、CPA 0%
    expect(summary.wow.spendPct).toBeCloseTo(25);
    expect(summary.wow.roasPct).toBeCloseTo(26.666, 1);
    expect(summary.wow.convPct).toBeCloseTo(25);
    expect(summary.wow.cpaPct).toBeCloseTo(0);
  });

  it("最佳/最差活動：本週 spend≥門檻中取 ROAS 極值", () => {
    const records = [
      // AAA：roas 5（最佳）
      makeRecord({
        date: "2026-07-01",
        campaign: "AAA_高效",
        spend: 600,
        revenue: 3000,
      }),
      // BBB：roas 2（最差）
      makeRecord({
        date: "2026-07-02",
        campaign: "BBB_低效",
        spend: 400,
        revenue: 800,
      }),
      // CCC：spend 低於預設門檻（minSpendForDecision=50），不列入
      makeRecord({
        date: "2026-07-03",
        campaign: "CCC_微量",
        spend: 10,
        revenue: 1000,
      }),
    ];

    const summary = buildWeeklySummary(records, { now: NOW });

    expect(summary.bestCampaign?.name).toBe("AAA");
    expect(summary.bestCampaign?.roas).toBeCloseTo(5);
    expect(summary.worstCampaign?.name).toBe("BBB");
    expect(summary.worstCampaign?.roas).toBeCloseTo(2);
  });

  it("上週無資料 → WoW 全 null（無從比較）", () => {
    const records = [
      makeRecord({ date: "2026-07-01", spend: 500, revenue: 1500 }),
    ];

    const summary = buildWeeklySummary(records, { now: NOW });

    expect(summary.lastWeek.spend).toBe(0);
    expect(summary.wow.spendPct).toBeNull();
    expect(summary.wow.roasPct).toBeNull();
    expect(summary.wow.cpaPct).toBeNull();
    expect(summary.wow.convPct).toBeNull();
  });

  it("除零保護：本週花費 0 → roas null；轉換 0 → cpa null", () => {
    const records = [
      makeRecord({
        date: "2026-07-01",
        spend: 0,
        revenue: 0,
        conversions: 0,
      }),
    ];

    const summary = buildWeeklySummary(records, { now: NOW });
    expect(summary.thisWeek.roas).toBeNull();
    expect(summary.thisWeek.cpa).toBeNull();
    expect(summary.bestCampaign).toBeNull();
    expect(summary.worstCampaign).toBeNull();
  });
});

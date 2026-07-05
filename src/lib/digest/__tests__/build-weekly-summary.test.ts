import { describe, it, expect } from "vitest";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import {
  deriveWeekWindows,
  buildWeeklySummary,
  weeklyPaceBudget,
} from "../build-weekly-summary";

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

describe("weeklyPaceBudget", () => {
  it("月預算 × 7 ÷ 當月天數（2026-07 為 31 天）", () => {
    // 3100 × 7 / 31 = 700
    expect(weeklyPaceBudget(3100, NOW)).toBeCloseTo(700);
  });

  it("月預算 ≤ 0 → null（無預算不配速）", () => {
    expect(weeklyPaceBudget(0, NOW)).toBeNull();
    expect(weeklyPaceBudget(-100, NOW)).toBeNull();
  });
});

describe("buildWeeklySummary 分帳號本週表現", () => {
  // 本週窗口 06-29~07-05；上週 06-22~06-28
  // 帳號 A（meta）：本週 spend 700 / rev 2100 / conv 35 → roas 3、cpa 20；
  //   上週 spend 350 / conv 10 → cpa 35。月預算 3100 → 週應花 700 → 配速 100%
  // 帳號 B（google）：本週 spend 500，無月預算 → 配速 null
  // 帳號 C（meta）：本週 spend 1400，月預算 3100 → 週應花 700 → 配速 200%（>100%）
  const records = [
    makeRecord({
      date: "2026-06-30",
      source: "meta",
      account_name: "帳戶A",
      spend: 700,
      revenue: 2100,
      conversions: 35,
    }),
    makeRecord({
      date: "2026-06-25",
      source: "meta",
      account_name: "帳戶A",
      spend: 350,
      revenue: 700,
      conversions: 10,
    }),
    makeRecord({
      date: "2026-07-01",
      source: "google",
      account_name: "帳戶B",
      spend: 500,
      revenue: 1000,
      conversions: 20,
    }),
    makeRecord({
      date: "2026-07-02",
      source: "meta",
      account_name: "帳戶C",
      spend: 1400,
      revenue: 2800,
      conversions: 40,
    }),
  ];

  const manualBudgets = { 帳戶A: 3100, 帳戶C: 3100 };

  it("依本週花費由高到低排序（C 1400 → A 700 → B 500）", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    expect(accounts.map((a) => a.accountName)).toEqual([
      "帳戶C",
      "帳戶A",
      "帳戶B",
    ]);
  });

  it("多帳號聚合：各帳號本週 spend/roas/conversions/cpa 正確", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    const a = accounts.find((x) => x.accountName === "帳戶A")!;
    expect(a.platform).toBe("Meta");
    expect(a.thisWeekSpend).toBe(700);
    expect(a.roas).toBeCloseTo(3);
    expect(a.conversions).toBe(35);
    expect(a.cpa).toBeCloseTo(20);
  });

  it("分帳號 WoW：花費 +100%、CPA -42.86%", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    const a = accounts.find((x) => x.accountName === "帳戶A")!;
    // 花費 (700-350)/350 = +100%
    expect(a.spendWow).toBeCloseTo(100);
    // CPA (20-35)/35 = -42.857%
    expect(a.cpaWow).toBeCloseTo(-42.857, 1);
  });

  it("weekProgress 有預算：帳戶A 週應花 700、花 700 → 100%，budgetSource=manual", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    const a = accounts.find((x) => x.accountName === "帳戶A")!;
    expect(a.weekProgress).toBeCloseTo(1);
    expect(a.budgetSource).toBe("manual");
  });

  it("weekProgress 無預算：帳戶B → null、budgetSource=null", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    const b = accounts.find((x) => x.accountName === "帳戶B")!;
    expect(b.weekProgress).toBeNull();
    expect(b.budgetSource).toBeNull();
  });

  it("weekProgress 超支（>100%）：帳戶C 花 1400 / 應花 700 → 200%", () => {
    const { accounts } = buildWeeklySummary(records, {
      now: NOW,
      manualBudgets,
    });
    const c = accounts.find((x) => x.accountName === "帳戶C")!;
    expect(c.weekProgress).toBeCloseTo(2);
    expect(c.weekProgress! > 1).toBe(true);
  });

  it("完全省略 manualBudgets → 所有帳號 weekProgress null", () => {
    const { accounts } = buildWeeklySummary(records, { now: NOW });
    expect(accounts.every((a) => a.weekProgress === null)).toBe(true);
    expect(accounts.every((a) => a.budgetSource === null)).toBe(true);
  });
});

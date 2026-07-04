import { describe, it, expect } from "vitest";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import {
  taipeiDateString,
  deriveDigestDates,
  buildDailySummary,
} from "../build-daily-summary";

/** 產生完整 28 欄位的測試記錄（與 rule-checker 測試同款 helper） */
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
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

// 固定「今天」= 台北 2026-07-04 09:00 → 昨日 2026-07-03
const TODAY = new Date("2026-07-04T09:00:00+08:00");

describe("taipeiDateString", () => {
  it("以台北時區輸出 YYYY-MM-DD", () => {
    // UTC 2026-07-03 17:00 = 台北 2026-07-04 01:00
    expect(taipeiDateString(new Date("2026-07-03T17:00:00Z"))).toBe(
      "2026-07-04",
    );
  });
});

describe("deriveDigestDates", () => {
  it("一般日期：昨日、月初、當月第幾天、當月天數", () => {
    expect(deriveDigestDates(TODAY)).toEqual({
      yesterday: "2026-07-03",
      monthStart: "2026-07-01",
      dayOfMonth: 3,
      daysInMonth: 31,
    });
  });

  it("月初邊界：7/1 的昨日是 6/30，月份切回 6 月（30 天）", () => {
    expect(deriveDigestDates(new Date("2026-07-01T08:30:00+08:00"))).toEqual({
      yesterday: "2026-06-30",
      monthStart: "2026-06-01",
      dayOfMonth: 30,
      daysInMonth: 30,
    });
  });
});

describe("buildDailySummary", () => {
  const options = { manualBudgets: {}, today: TODAY, daysInMonth: 31 };

  it("昨日花費只加總昨日記錄", () => {
    const records = [
      makeRecord({ date: "2026-07-03", spend: 100 }),
      makeRecord({ date: "2026-07-03", spend: 50, account_name: "B 帳戶" }),
      makeRecord({ date: "2026-07-02", spend: 999 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.date).toBe("2026-07-03");
    expect(summary.yesterdaySpend).toBe(150);
  });

  it("昨日 ROAS 與 CPA 正確計算", () => {
    const records = [
      makeRecord({
        date: "2026-07-03",
        spend: 100,
        revenue: 300,
        conversions: 4,
      }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.yesterdayRoas).toBe(3);
    expect(summary.yesterdayCpa).toBe(25);
  });

  it("除零保護：花費 0 → ROAS null；轉換 0 → CPA null", () => {
    const records = [
      makeRecord({ date: "2026-07-03", spend: 0, revenue: 0, conversions: 0 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.yesterdayRoas).toBeNull();
    expect(summary.yesterdayCpa).toBeNull();
  });

  it("本月花費只計 7/1～7/3，不混入 6 月與今日之後的資料", () => {
    const records = [
      makeRecord({ date: "2026-06-30", spend: 500 }),
      makeRecord({ date: "2026-07-01", spend: 100 }),
      makeRecord({ date: "2026-07-03", spend: 200 }),
      makeRecord({ date: "2026-07-04", spend: 999 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.monthSpend).toBe(300);
  });

  it("無任何預算 → monthBudget 0、monthProgress null", () => {
    const records = [makeRecord({ date: "2026-07-03" })];

    const summary = buildDailySummary(records, options);
    expect(summary.monthBudget).toBe(0);
    expect(summary.monthProgress).toBeNull();
  });

  it("手動月預算 → monthProgress = 有預算帳號花費 ÷ 期間預算", () => {
    // 手動月預算 31000、31 天 → 日預算 1000 → 3 天期間預算 3000
    const records = [
      makeRecord({ date: "2026-07-01", spend: 900 }),
      makeRecord({ date: "2026-07-03", spend: 1800 }),
      makeRecord({ date: "2026-07-03", spend: 50, account_name: "無預算帳戶" }),
    ];

    const summary = buildDailySummary(records, {
      manualBudgets: { 測試帳戶: 31000 },
      today: TODAY,
      daysInMonth: 31,
    });

    expect(summary.monthBudget).toBe(3000);
    // 只計「有預算帳號」的花費 2700，不含無預算帳戶的 50
    expect(summary.monthProgress).toBeCloseTo(0.9);
    expect(summary.accounts.length).toBe(2);
  });

  it("alerts 選項原樣帶出，未給時為空陣列", () => {
    const summary = buildDailySummary(
      [makeRecord({ date: "2026-07-03" })],
      options,
    );
    expect(summary.alerts).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  initiativeKey,
  aggregateInitiatives,
  countDistinctDates,
  aggregateAccounts,
} from "../transform";
import type { WindsorAdRecord } from "@/lib/windsor/types";

// 建立測試用的廣告記錄（含 Meta 預算欄位）
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2024-01-01",
    source: "meta",
    account_name: "魔幻主義",
    campaign: "夏季購物_轉換",
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

describe("initiativeKey", () => {
  it("多底線只取第一個 _ 之前的前綴", () => {
    expect(initiativeKey("夏季購物_轉換_v2", "魔幻主義").prefix).toBe(
      "夏季購物",
    );
  });

  it("無底線時整串當前綴", () => {
    expect(initiativeKey("品牌日", "魔幻主義").prefix).toBe("品牌日");
  });

  it("以底線開頭時退回整串當前綴", () => {
    expect(initiativeKey("_未分類", "魔幻主義").prefix).toBe("_未分類");
  });

  it("空 campaign 用未命名，空帳號用未命名帳戶", () => {
    const k = initiativeKey("", "");
    expect(k.prefix).toBe("未命名");
    expect(k.accountName).toBe("未命名帳戶");
  });

  it("key 由帳號與前綴組成", () => {
    expect(initiativeKey("夏季購物_轉換", "魔幻主義").key).toBe(
      "魔幻主義:::夏季購物",
    );
  });
});

describe("aggregateInitiatives", () => {
  it("空資料回傳空陣列", () => {
    expect(aggregateInitiatives([])).toEqual([]);
  });

  it("同前綴不同帳號不合併", () => {
    const rows = aggregateInitiatives([
      makeRecord({ account_name: "魔幻主義", campaign: "夏季購物_轉換" }),
      makeRecord({ account_name: "Plaisir", campaign: "夏季購物_觸及" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("同帳號同前綴合併並加總花費/營收/轉換", () => {
    const rows = aggregateInitiatives([
      makeRecord({
        campaign: "夏季購物_轉換",
        spend: 100,
        revenue: 500,
        conversions: 10,
      }),
      makeRecord({
        campaign: "夏季購物_觸及",
        spend: 300,
        revenue: 700,
        conversions: 30,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(400);
    expect(rows[0].revenue).toBe(1200);
    expect(rows[0].conversions).toBe(40);
  });

  it("ROAS 用加權（Σ營收/Σ花費）", () => {
    const rows = aggregateInitiatives([
      makeRecord({ campaign: "夏季購物_轉換", spend: 100, revenue: 500 }),
      makeRecord({ campaign: "夏季購物_觸及", spend: 300, revenue: 700 }),
    ]);
    expect(rows[0].roas).toBeCloseTo(1200 / 400);
  });

  it("CPA = Σ花費 / Σ轉換，轉換為 0 時 CPA 為 0", () => {
    const withConv = aggregateInitiatives([
      makeRecord({ campaign: "A_x", spend: 400, conversions: 40 }),
    ]);
    expect(withConv[0].cpa).toBeCloseTo(10);

    const noConv = aggregateInitiatives([
      makeRecord({ campaign: "B_x", spend: 400, conversions: 0 }),
    ]);
    expect(noConv[0].cpa).toBe(0);
  });

  it("預算為快照：同 campaign 跨日不重複加總，跨 campaign 加總", () => {
    const rows = aggregateInitiatives([
      // 同一 campaign 兩天，lifetime 皆 10000 → 只算一次
      makeRecord({
        campaign: "夏季購物_轉換",
        date: "2024-01-01",
        campaignLifetimeBudget: 10000,
      }),
      makeRecord({
        campaign: "夏季購物_轉換",
        date: "2024-01-02",
        campaignLifetimeBudget: 10000,
      }),
      // 另一 campaign lifetime 5000 → 加總
      makeRecord({
        campaign: "夏季購物_觸及",
        date: "2024-01-01",
        campaignLifetimeBudget: 5000,
      }),
    ]);
    expect(rows[0].lifetimeBudget).toBe(15000);
  });

  it("有 lifetime 預算時 progress = 花費/預算 且 hasBudget 為真", () => {
    const rows = aggregateInitiatives([
      makeRecord({
        campaign: "夏季購物_轉換",
        spend: 6200,
        campaignLifetimeBudget: 10000,
      }),
    ]);
    expect(rows[0].hasBudget).toBe(true);
    expect(rows[0].budget).toBe(10000);
    expect(rows[0].progress).toBeCloseTo(0.62);
  });

  it("無 lifetime 預算時 progress 為 0 且 hasBudget 為假", () => {
    const rows = aggregateInitiatives([
      makeRecord({
        campaign: "夏季購物_轉換",
        spend: 500,
        campaignLifetimeBudget: 0,
        campaignDailyBudget: 500,
      }),
    ]);
    expect(rows[0].hasBudget).toBe(false);
    expect(rows[0].progress).toBe(0);
    expect(rows[0].dailyBudget).toBe(500);
  });

  it("展開明細包含底下各 campaign", () => {
    const rows = aggregateInitiatives([
      makeRecord({ campaign: "夏季購物_轉換", spend: 100 }),
      makeRecord({ campaign: "夏季購物_觸及", spend: 300 }),
    ]);
    const names = rows[0].campaigns.map((c) => c.campaign).sort();
    expect(names).toEqual(["夏季購物_觸及", "夏季購物_轉換"]);
  });

  it("campaign 狀態取最新日期那筆", () => {
    const rows = aggregateInitiatives([
      makeRecord({ date: "2024-01-01", campaignStatus: "ACTIVE" }),
      makeRecord({ date: "2024-01-02", campaignStatus: "PAUSED" }),
    ]);
    expect(rows[0].campaigns[0].status).toBe("PAUSED");
  });

  it("資料順序顛倒仍取最新日期狀態", () => {
    const rows = aggregateInitiatives([
      makeRecord({ date: "2024-01-02", campaignStatus: "PAUSED" }),
      makeRecord({ date: "2024-01-01", campaignStatus: "ACTIVE" }),
    ]);
    expect(rows[0].campaigns[0].status).toBe("PAUSED");
  });
});

describe("countDistinctDates", () => {
  it("回傳不重複日期數", () => {
    expect(
      countDistinctDates([
        makeRecord({ date: "2024-01-01" }),
        makeRecord({ date: "2024-01-01", campaign: "另一活動_x" }),
        makeRecord({ date: "2024-01-02" }),
      ]),
    ).toBe(2);
  });

  it("空資料為 0", () => {
    expect(countDistinctDates([])).toBe(0);
  });
});

describe("aggregateInitiatives - 配速預算", () => {
  it("日預算活動的期間預算 = Σ(ACTIVE 日預算) × 天數，並算出配速達成率", () => {
    const rows = aggregateInitiatives(
      [
        makeRecord({
          campaign: "夏季購物_轉換",
          spend: 2800,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "夏季購物_觸及",
          spend: 200,
          campaignDailyBudget: 300,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    // 只計 ACTIVE 的 500 × 7 = 3500；花費含暫停活動 = 3000
    expect(rows[0].periodBudget).toBe(3500);
    expect(rows[0].pacingProgress).toBeCloseTo(3000 / 3500);
  });

  it("有 lifetime 預算的活動列走消耗語意：pacingProgress 為 0", () => {
    const rows = aggregateInitiatives(
      [
        makeRecord({
          campaign: "夏季購物_轉換",
          campaignLifetimeBudget: 10000,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    expect(rows[0].hasBudget).toBe(true);
    expect(rows[0].pacingProgress).toBe(0);
  });

  it("未帶天數（預設 0）時 periodBudget 為 0、pacingProgress 為 0", () => {
    const rows = aggregateInitiatives([
      makeRecord({
        campaign: "夏季購物_轉換",
        campaignDailyBudget: 500,
        campaignStatus: "ACTIVE",
      }),
    ]);
    expect(rows[0].periodBudget).toBe(0);
    expect(rows[0].pacingProgress).toBe(0);
  });
});

describe("aggregateAccounts", () => {
  it("期間預算只計 ACTIVE 活動：Σ日預算 × 天數；暫停活動花費仍計入", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          spend: 100,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "B_x",
          spend: 50,
          campaignDailyBudget: 300,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    expect(s).toHaveLength(1);
    expect(s[0].periodBudget).toBe(3500);
    expect(s[0].spend).toBe(150);
    expect(s[0].progress).toBeCloseTo(150 / 3500);
    expect(s[0].hasBudget).toBe(true);
  });

  it("lifetime 活動以 lifetime 金額計入且不乘天數", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          campaignLifetimeBudget: 10000,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "B_x",
          campaignDailyBudget: 200,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    // lifetime 10000 + ACTIVE 日預算 200×7 = 11400
    expect(s[0].periodBudget).toBe(11400);
  });

  it("日預算為快照：同活動跨日取最大值不加總", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          date: "2024-01-01",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "A_x",
          date: "2024-01-02",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    expect(s[0].periodBudget).toBe(3500);
  });

  it("狀態取最新日期：後來暫停的活動不計入分母", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          date: "2024-01-01",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "A_x",
          date: "2024-01-02",
          campaignDailyBudget: 500,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    expect(s[0].periodBudget).toBe(0);
    expect(s[0].hasBudget).toBe(false);
    expect(s[0].progress).toBe(0);
  });

  it("不同帳號分開彙總，依花費由高到低排序", () => {
    const s = aggregateAccounts(
      [
        makeRecord({ account_name: "魔幻主義", spend: 100 }),
        makeRecord({ account_name: "Plaisir", spend: 900 }),
      ],
      7,
    );
    expect(s.map((a) => a.accountName)).toEqual(["Plaisir", "魔幻主義"]);
  });

  it("空資料回傳空陣列", () => {
    expect(aggregateAccounts([], 7)).toEqual([]);
  });
});

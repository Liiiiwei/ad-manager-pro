import { describe, it, expect } from "vitest";
import { checkRules } from "../rule-checker";
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
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

// 建立測試用規則
function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    name: "測試規則",
    metric: "spend",
    condition: "gt",
    threshold: 100,
    platform: "all",
    campaignFilter: null,
    ...overrides,
  };
}

describe("checkRules", () => {
  it("「大於」條件：當指標超過門檻時觸發", () => {
    // 需要至少 2 個不同日期的資料
    const data = [
      makeRecord({ date: "2024-01-01", spend: 80 }),
      makeRecord({ date: "2024-01-02", spend: 200 }),
    ];
    const rules = [
      makeRule({ metric: "spend", condition: "gt", threshold: 150 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleName).toBe("測試規則");
    expect(alerts[0].currentValue).toBe(200);
  });

  it("「小於」條件：當指標低於門檻時觸發", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 100 }),
      makeRecord({ date: "2024-01-02", spend: 30 }),
    ];
    const rules = [
      makeRule({ metric: "spend", condition: "lt", threshold: 50 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].currentValue).toBe(30);
  });

  it("「大於」條件：未超過門檻時不觸發", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 80 }),
      makeRecord({ date: "2024-01-02", spend: 90 }),
    ];
    const rules = [
      makeRule({ metric: "spend", condition: "gt", threshold: 100 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(0);
  });

  it("平台過濾：meta 規則只檢查 Meta 平台資料", () => {
    const data = [
      makeRecord({ date: "2024-01-01", source: "facebook", spend: 50 }),
      makeRecord({ date: "2024-01-02", source: "facebook", spend: 200 }),
      makeRecord({ date: "2024-01-01", source: "google", spend: 500 }),
      makeRecord({ date: "2024-01-02", source: "google", spend: 600 }),
    ];
    const rules = [
      makeRule({
        metric: "spend",
        condition: "gt",
        threshold: 150,
        platform: "meta",
      }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    // 應使用 Meta 資料的最新日期值
    expect(alerts[0].currentValue).toBe(200);
  });

  it("平台過濾：google 規則只檢查 Google 平台資料", () => {
    const data = [
      makeRecord({ date: "2024-01-01", source: "facebook", spend: 500 }),
      makeRecord({ date: "2024-01-02", source: "facebook", spend: 600 }),
      makeRecord({ date: "2024-01-01", source: "google", spend: 50 }),
      makeRecord({ date: "2024-01-02", source: "google", spend: 200 }),
    ];
    const rules = [
      makeRule({
        metric: "spend",
        condition: "gt",
        threshold: 150,
        platform: "google",
      }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].currentValue).toBe(200);
  });

  it("campaign 過濾：只檢查匹配的活動（模糊匹配）", () => {
    const data = [
      makeRecord({ date: "2024-01-01", campaign: "品牌曝光活動", spend: 50 }),
      makeRecord({ date: "2024-01-02", campaign: "品牌曝光活動", spend: 200 }),
      makeRecord({ date: "2024-01-01", campaign: "轉換活動", spend: 50 }),
      makeRecord({ date: "2024-01-02", campaign: "轉換活動", spend: 20 }),
    ];
    const rules = [
      makeRule({
        metric: "spend",
        condition: "gt",
        threshold: 150,
        campaignFilter: "品牌",
      }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
  });

  it("空資料不產生警報", () => {
    const rules = [makeRule()];
    const alerts = checkRules(rules, []);
    expect(alerts).toHaveLength(0);
  });

  it("資料不足（少於 2 筆）不產生警報", () => {
    const data = [makeRecord()];
    const rules = [makeRule()];
    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(0);
  });

  it("零門檻的規則正確處理", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 0 }),
      makeRecord({ date: "2024-01-02", spend: 10 }),
    ];
    const rules = [
      makeRule({ metric: "spend", condition: "gt", threshold: 0 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
  });

  it("變化率大於條件（change_gt）正確觸發", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 100 }),
      makeRecord({ date: "2024-01-02", spend: 250 }),
    ];
    // 漲幅 150%，門檻 50%
    const rules = [
      makeRule({ metric: "spend", condition: "change_gt", threshold: 50 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].changePercent).toBeGreaterThan(50);
  });

  it("變化率小於條件（change_lt）正確觸發", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 200 }),
      makeRecord({ date: "2024-01-02", spend: 50 }),
    ];
    // 跌幅 75%，門檻 50%
    const rules = [
      makeRule({ metric: "spend", condition: "change_lt", threshold: 50 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
  });

  it("ROAS 指標以 revenue/spend 計算", () => {
    const data = [
      makeRecord({
        date: "2024-01-01",
        spend: 100,
        revenue: 200,
        roas: 2.0,
      }),
      makeRecord({
        date: "2024-01-02",
        spend: 100,
        revenue: 500,
        roas: 5.0,
      }),
    ];
    const rules = [makeRule({ metric: "roas", condition: "gt", threshold: 4 })];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].currentValue).toBe(5); // revenue(500) / spend(100) = 5
  });

  it("嚴重性分級正確（change_gt 超過門檻 2 倍為 critical）", () => {
    const data = [
      makeRecord({ date: "2024-01-01", spend: 100 }),
      makeRecord({ date: "2024-01-02", spend: 500 }),
    ];
    // 漲幅 400%，門檻 50%，超過 2 倍
    const rules = [
      makeRule({ metric: "spend", condition: "change_gt", threshold: 50 }),
    ];

    const alerts = checkRules(rules, data);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });
});

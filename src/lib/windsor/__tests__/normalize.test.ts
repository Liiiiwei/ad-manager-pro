import { describe, it, expect } from "vitest";
import { normalizeRecord } from "../types";
import { rateToTwd } from "@/lib/utils/currency";

type RawInput = Parameters<typeof normalizeRecord>[0];

// 建立 Windsor 原始資料（未正規化）；只填測試需要的欄位，其餘由 zod 補預設
function makeRaw(overrides: Record<string, unknown> = {}): RawInput {
  const raw = {
    date: "2026-01-01",
    source: "facebook",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset_name: "測試廣告組",
    ad_name: "測試廣告",
    spend: 1000,
    impressions: 10000,
    clicks: 200,
    frequency: 1.5,
    cpc: 5,
    cpm: 100,
    ctr: 2,
    action_values_omni_purchase: 3000,
    action_values_add_to_cart: 500,
    campaign_lifetime_budget: 20000,
    campaign_daily_budget: 2000,
    campaign_budget_remaining: 8000,
    account_currency: "TWD",
    ...overrides,
  };
  return raw as unknown as RawInput;
}

describe("normalizeRecord 貨幣換算", () => {
  it("TWD 帳戶金額維持原值", () => {
    const r = normalizeRecord(makeRaw({ account_currency: "TWD" }));
    expect(r.spend).toBe(1000);
    expect(r.campaignDailyBudget).toBe(2000);
  });

  it("HKD 帳戶的金額欄位換算為 TWD", () => {
    const rate = rateToTwd("HKD");
    const r = normalizeRecord(makeRaw({ account_currency: "HKD" }));
    expect(r.spend).toBeCloseTo(1000 * rate, 6);
    expect(r.revenue).toBeCloseTo(3000 * rate, 6);
    expect(r.purchaseValue).toBeCloseTo(3000 * rate, 6);
    expect(r.addToCartValue).toBeCloseTo(500 * rate, 6);
    expect(r.cpc).toBeCloseTo(5 * rate, 6);
    expect(r.cpm).toBeCloseTo(100 * rate, 6);
    expect(r.campaignLifetimeBudget).toBeCloseTo(20000 * rate, 6);
    expect(r.campaignDailyBudget).toBeCloseTo(2000 * rate, 6);
    expect(r.campaignBudgetRemaining).toBeCloseTo(8000 * rate, 6);
  });

  it("ROAS 為比率，換算後不變", () => {
    // revenue/spend = 3000/1000 = 3，換算前後皆為 3
    const r = normalizeRecord(makeRaw({ account_currency: "HKD" }));
    expect(r.roas).toBeCloseTo(3, 6);
  });

  it("非金額欄位（點擊、曝光、CTR）不受換算影響", () => {
    const r = normalizeRecord(makeRaw({ account_currency: "HKD" }));
    expect(r.clicks).toBe(200);
    expect(r.impressions).toBe(10000);
    expect(r.ctr).toBe(2);
  });

  it("缺 account_currency 時視為 TWD（不換算）", () => {
    const raw = makeRaw();
    delete (raw as Record<string, unknown>).account_currency;
    const r = normalizeRecord(raw);
    expect(r.spend).toBe(1000);
  });
});

import { describe, it, expect } from "vitest";
import { extractCampaignBudgets, diffCampaignBudgets } from "../snapshot";
import type { WindsorAdRecord } from "@/lib/windsor/types";

function rec(overrides: Partial<WindsorAdRecord>): WindsorAdRecord {
  return {
    date: "2026-07-04",
    source: "facebook",
    account_name: "魔幻主義",
    campaign: "夏季轉換",
    spend: 100,
    revenue: 0,
    conversions: 0,
    campaignDailyBudget: 0,
    campaignLifetimeBudget: 0,
    campaignStatus: "ACTIVE",
    ...overrides,
  } as WindsorAdRecord;
}

describe("extractCampaignBudgets", () => {
  it("同 campaign 跨日取最大預算，daily 與 lifetime 各產一筆", () => {
    const out = extractCampaignBudgets([
      rec({ campaignDailyBudget: 500, campaignLifetimeBudget: 0 }),
      rec({
        date: "2026-07-05",
        campaignDailyBudget: 800,
        campaignLifetimeBudget: 20000,
      }),
    ]);
    expect(out).toContainEqual(
      expect.objectContaining({
        entityKey: "夏季轉換",
        budgetType: "daily",
        budgetValue: 800,
      }),
    );
    expect(out).toContainEqual(
      expect.objectContaining({
        entityKey: "夏季轉換",
        budgetType: "lifetime",
        budgetValue: 20000,
      }),
    );
  });

  it("預算為 0 的類型不產生快照條目", () => {
    const out = extractCampaignBudgets([
      rec({ campaignDailyBudget: 0, campaignLifetimeBudget: 0 }),
    ]);
    expect(out).toEqual([]);
  });

  it("平台正規化為 meta / google", () => {
    const out = extractCampaignBudgets([
      rec({ source: "facebook", campaignDailyBudget: 100 }),
      rec({ source: "google_ads", campaign: "搜尋", campaignDailyBudget: 200 }),
    ]);
    expect(out.find((c) => c.entityKey === "夏季轉換")?.platform).toBe("meta");
    expect(out.find((c) => c.entityKey === "搜尋")?.platform).toBe("google");
  });
});

describe("diffCampaignBudgets", () => {
  const current = [
    {
      entityKey: "夏季轉換",
      entityLabel: "夏季轉換",
      platform: "meta",
      accountName: "魔幻主義",
      budgetType: "daily" as const,
      budgetValue: 800,
    },
  ];

  it("首見（無快照）不算變更", () => {
    expect(diffCampaignBudgets([], current)).toEqual([]);
  });

  it("值改變時產生一筆變更並計算變動百分比", () => {
    const changes = diffCampaignBudgets(
      [{ entityKey: "夏季轉換", budgetType: "daily", budgetValue: 400 }],
      current,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      previousValue: 400,
      newValue: 800,
      changePercent: 100,
    });
    expect(changes[0].accountName).toBe("魔幻主義");
  });

  it("值相同不算變更", () => {
    const changes = diffCampaignBudgets(
      [{ entityKey: "夏季轉換", budgetType: "daily", budgetValue: 800 }],
      current,
    );
    expect(changes).toEqual([]);
  });
});

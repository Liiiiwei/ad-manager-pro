import { describe, it, expect } from "vitest";
import { extractCampaignBudgets, diffCampaignBudgets } from "../snapshot";
import type { WindsorAdRecord } from "@/lib/windsor/types";

/** 測試本地重建 entityKey 組合邏輯（與 snapshot.ts 內部 makeEntityKey 一致，用單元分隔字元串接）*/
function entityKey(
  platform: string,
  accountName: string,
  campaignName: string,
): string {
  return [platform, accountName, campaignName].join("");
}

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
    const key = entityKey("meta", "魔幻主義", "夏季轉換");
    expect(out).toContainEqual(
      expect.objectContaining({
        entityKey: key,
        budgetType: "daily",
        budgetValue: 800,
      }),
    );
    expect(out).toContainEqual(
      expect.objectContaining({
        entityKey: key,
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
    expect(
      out.find((c) => c.entityLabel.startsWith("夏季轉換"))?.platform,
    ).toBe("meta");
    expect(out.find((c) => c.entityLabel.startsWith("搜尋"))?.platform).toBe(
      "google",
    );
  });

  it("跨帳戶同名 campaign 不合併，各自產生獨立快照", () => {
    const out = extractCampaignBudgets([
      rec({
        account_name: "魔幻主義",
        campaign: "夏季轉換",
        campaignDailyBudget: 500,
      }),
      rec({
        account_name: "另一客戶",
        campaign: "夏季轉換",
        campaignDailyBudget: 900,
      }),
    ]);
    const dailyEntries = out.filter((c) => c.budgetType === "daily");
    expect(dailyEntries).toHaveLength(2);
    expect(dailyEntries).toContainEqual(
      expect.objectContaining({
        entityKey: entityKey("meta", "魔幻主義", "夏季轉換"),
        accountName: "魔幻主義",
        budgetValue: 500,
      }),
    );
    expect(dailyEntries).toContainEqual(
      expect.objectContaining({
        entityKey: entityKey("meta", "另一客戶", "夏季轉換"),
        accountName: "另一客戶",
        budgetValue: 900,
      }),
    );
  });

  it("跨平台同名 campaign 不合併，各自產生獨立快照", () => {
    const out = extractCampaignBudgets([
      rec({
        source: "facebook",
        account_name: "魔幻主義",
        campaign: "夏季轉換",
        campaignDailyBudget: 300,
      }),
      rec({
        source: "google_ads",
        account_name: "魔幻主義",
        campaign: "夏季轉換",
        campaignDailyBudget: 700,
      }),
    ]);
    const dailyEntries = out.filter((c) => c.budgetType === "daily");
    expect(dailyEntries).toHaveLength(2);
    expect(dailyEntries).toContainEqual(
      expect.objectContaining({
        entityKey: entityKey("meta", "魔幻主義", "夏季轉換"),
        platform: "meta",
        budgetValue: 300,
      }),
    );
    expect(dailyEntries).toContainEqual(
      expect.objectContaining({
        entityKey: entityKey("google", "魔幻主義", "夏季轉換"),
        platform: "google",
        budgetValue: 700,
      }),
    );
  });
});

describe("diffCampaignBudgets", () => {
  const key = entityKey("meta", "魔幻主義", "夏季轉換");
  const current = [
    {
      entityKey: key,
      entityLabel: "夏季轉換（魔幻主義）",
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
      [{ entityKey: key, budgetType: "daily", budgetValue: 400 }],
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
      [{ entityKey: key, budgetType: "daily", budgetValue: 800 }],
      current,
    );
    expect(changes).toEqual([]);
  });
});

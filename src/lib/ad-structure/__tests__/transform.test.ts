import { describe, it, expect } from "vitest";
import { buildTree } from "../transform";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert } from "@/lib/analysis/types";

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

describe("buildTree", () => {
  it("空資料回傳空樹", () => {
    const result = buildTree([], []);
    expect(result).toEqual([]);
  });

  it("單一帳戶與單一活動建立正確的階層結構", () => {
    const records = [makeRecord()];
    const result = buildTree(records, []);

    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("account");
    expect(result[0].label).toBe("測試帳戶");
    expect(result[0].platform).toBe("meta");

    // campaign 層
    const campaigns = result[0].children;
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].level).toBe("campaign");
    expect(campaigns[0].label).toBe("測試活動");

    // adset 層
    const adsets = campaigns[0].children;
    expect(adsets).toHaveLength(1);
    expect(adsets[0].level).toBe("adset");
    expect(adsets[0].label).toBe("測試廣告組");

    // ad 層
    const ads = adsets[0].children;
    expect(ads).toHaveLength(1);
    expect(ads[0].level).toBe("ad");
    expect(ads[0].label).toBe("測試廣告");
  });

  it("多個帳戶正確分組", () => {
    const records = [
      makeRecord({ account_name: "帳戶A", source: "meta" }),
      makeRecord({ account_name: "帳戶B", source: "google" }),
    ];
    const result = buildTree(records, []);

    expect(result).toHaveLength(2);
    const labels = result.map((n) => n.label).sort();
    expect(labels).toEqual(["帳戶A", "帳戶B"]);
  });

  it("指標正確向上聚合（花費加總）", () => {
    const records = [
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        ad_name: "廣告1",
        spend: 100,
        roas: 3.0,
        ctr: 2.0,
        cpc: 0.5,
      }),
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        ad_name: "廣告2",
        spend: 200,
        roas: 6.0,
        ctr: 4.0,
        cpc: 1.0,
      }),
    ];
    const result = buildTree(records, []);

    // 帳戶層花費加總
    expect(result[0].metrics.spend).toBe(300);

    // campaign 層花費加總
    const campaign = result[0].children[0];
    expect(campaign.metrics.spend).toBe(300);

    // adset 層花費加總
    const adset = campaign.children[0];
    expect(adset.metrics.spend).toBe(300);

    // ROAS 使用花費加權平均：(3*100 + 6*200) / (100+200) = 1500/300 = 5
    expect(adset.metrics.roas).toBe(5);

    // CTR 使用花費加權平均：(2*100 + 4*200) / (100+200) = 1000/300 ≈ 3.333
    expect(adset.metrics.ctr).toBeCloseTo(3.333, 2);

    // CPC 使用花費加權平均：(0.5*100 + 1*200) / (100+200) = 250/300 ≈ 0.833
    expect(adset.metrics.cpc).toBeCloseTo(0.833, 2);
  });

  it("多天資料合併（同名廣告的花費加總）", () => {
    const records = [
      makeRecord({ date: "2024-01-01", spend: 50, roas: 3.0 }),
      makeRecord({ date: "2024-01-02", spend: 150, roas: 5.0 }),
    ];
    const result = buildTree(records, []);

    // 同名廣告的兩天資料合併：花費加總
    const ad = result[0].children[0].children[0].children[0];
    expect(ad.metrics.spend).toBe(200);

    // ROAS 使用花費加權平均：(3*50 + 5*150) / 200 = 900/200 = 4.5
    expect(ad.metrics.roas).toBe(4.5);
  });

  it("缺失欄位使用預設值", () => {
    const records = [
      makeRecord({
        account_name: "",
        campaign: "",
        adset: "",
        ad_name: "",
      }),
    ];
    const result = buildTree(records, []);

    expect(result[0].label).toBe("未命名帳戶");
    expect(result[0].children[0].label).toBe("未命名廣告活動");
    expect(result[0].children[0].children[0].label).toBe("未命名廣告組");
    expect(result[0].children[0].children[0].children[0].label).toBe(
      "未命名廣告",
    );
  });

  it("null 值的指標不影響聚合", () => {
    const records = [makeRecord({ spend: 0, roas: 0, ctr: 0, cpc: 0 })];
    const result = buildTree(records, []);

    expect(result[0].metrics.spend).toBe(0);
    expect(result[0].metrics.roas).toBe(0);
    expect(result[0].metrics.ctr).toBe(0);
    expect(result[0].metrics.cpc).toBe(0);
  });

  it("暫停節點聚合為「已暫停」卡片", () => {
    const records = [
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        ad_name: "廣告1",
        adStatus: "ACTIVE",
      }),
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        ad_name: "廣告2",
        adStatus: "PAUSED",
      }),
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        ad_name: "廣告3",
        adStatus: "PAUSED",
      }),
    ];
    const result = buildTree(records, []);

    const adset = result[0].children[0].children[0];
    // 應該有 1 個 ACTIVE 廣告 + 1 個「已暫停 (2)」聚合卡
    expect(adset.children).toHaveLength(2);

    const pausedGroup = adset.children.find((c) => c.isPausedGroup);
    expect(pausedGroup).toBeDefined();
    expect(pausedGroup!.label).toBe("已暫停 (2)");
    expect(pausedGroup!.children).toHaveLength(2);
    expect(pausedGroup!.status).toBe("PAUSED");
  });

  it("警報計數正確計算", () => {
    const records = [makeRecord({ account_name: "帳戶X", campaign: "活動Y" })];
    const alerts: Alert[] = [
      {
        id: "a1",
        category: "performance",
        severity: "warning",
        title: "test",
        description: "test",
        metric: "ctr",
        currentValue: 1,
        previousValue: 2,
        changePercent: -50,
        platform: "meta",
        accountName: "帳戶X",
        campaignName: "活動Y",
        detectedAt: "2024-01-01",
        recommendation: "test",
      },
    ];
    const result = buildTree(records, alerts);

    // campaign 層應有 1 個警報
    const campaign = result[0].children[0];
    expect(campaign.alertCount).toBeGreaterThanOrEqual(1);

    // account 層也應向上累計
    expect(result[0].alertCount).toBeGreaterThanOrEqual(1);
  });

  it("activeChildCount 計算非暫停的直接子節點數", () => {
    const records = [
      makeRecord({
        campaign: "活動A",
        adset: "組1",
        adsetStatus: "ACTIVE",
      }),
      makeRecord({
        campaign: "活動A",
        adset: "組2",
        adsetStatus: "PAUSED",
      }),
    ];
    const result = buildTree(records, []);

    const campaign = result[0].children[0];
    expect(campaign.activeChildCount).toBe(1);
  });
});

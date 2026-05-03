import { describe, it, expect } from "vitest";
import {
  buildAdPerformanceQuery,
  buildDailyTrendQuery,
  buildAdLevelQuery,
  AD_PERFORMANCE_FIELDS,
  DAILY_TREND_FIELDS,
} from "../queries";

describe("buildAdPerformanceQuery", () => {
  it("回傳正確的 connector 和 date_preset", () => {
    const query = buildAdPerformanceQuery("facebook", "last_7d");
    expect(query.connector).toBe("facebook");
    expect(query.date_preset).toBe("last_7d");
  });

  it("包含所有廣告成效欄位", () => {
    const query = buildAdPerformanceQuery("facebook", "last_30d");
    expect(query.fields).toEqual(AD_PERFORMANCE_FIELDS);
    expect(query.fields).toContain("date");
    expect(query.fields).toContain("spend");
    expect(query.fields).toContain("ctr");
    expect(query.fields).toContain("actions_purchase");
    expect(query.fields).toContain("website_purchase_roas");
  });

  it("不包含 date_aggregation", () => {
    const query = buildAdPerformanceQuery("google_ads", "last_7d");
    expect(query.date_aggregation).toBeUndefined();
  });

  it("支援 all connector", () => {
    const query = buildAdPerformanceQuery("all", "last_7d");
    expect(query.connector).toBe("all");
  });
});

describe("buildDailyTrendQuery", () => {
  it("回傳每日聚合設定", () => {
    const query = buildDailyTrendQuery("facebook", "last_7d");
    expect(query.date_aggregation).toBe("day");
  });

  it("使用趨勢欄位集", () => {
    const query = buildDailyTrendQuery("facebook", "last_7d");
    expect(query.fields).toEqual(DAILY_TREND_FIELDS);
  });

  it("趨勢欄位比完整欄位少", () => {
    expect(DAILY_TREND_FIELDS.length).toBeLessThan(
      AD_PERFORMANCE_FIELDS.length,
    );
  });

  it("趨勢欄位包含必要的日期與花費", () => {
    expect(DAILY_TREND_FIELDS).toContain("date");
    expect(DAILY_TREND_FIELDS).toContain("spend");
    expect(DAILY_TREND_FIELDS).toContain("impressions");
  });
});

describe("buildAdLevelQuery", () => {
  it("使用完整廣告欄位", () => {
    const query = buildAdLevelQuery("facebook", "last_14d");
    expect(query.fields).toEqual(AD_PERFORMANCE_FIELDS);
  });

  it("不包含 date_aggregation", () => {
    const query = buildAdLevelQuery("facebook", "last_14d");
    expect(query.date_aggregation).toBeUndefined();
  });
});

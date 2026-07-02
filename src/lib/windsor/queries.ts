import type { WindsorQueryParams } from "./types";

/** 廣告成效所需的欄位（使用 Meta 特有的轉換欄位） */
const AD_PERFORMANCE_FIELDS = [
  "date",
  "source",
  "account_name",
  "account_currency",
  "campaign",
  "adset_name",
  "ad_name",
  "campaign_status",
  "adset_status",
  "ad_status",
  "spend",
  "impressions",
  "clicks",
  "frequency",
  "cpc",
  "cpm",
  "ctr",
  // Meta 轉換欄位
  "actions_purchase",
  "actions_add_to_cart",
  "actions_initiate_checkout",
  "actions_lead",
  "actions_landing_page_view",
  "action_values_omni_purchase",
  "action_values_add_to_cart",
  "website_purchase_roas",
];

/** 每日趨勢所需欄位（較少，用於圖表） */
const DAILY_TREND_FIELDS = [
  "date",
  "source",
  "spend",
  "impressions",
  "clicks",
  "cpc",
  "cpm",
  "ctr",
  "actions_purchase",
  "action_values_omni_purchase",
  "website_purchase_roas",
];

/** 取得指定時間範圍的廣告成效資料 */
export function buildAdPerformanceQuery(
  connector: WindsorQueryParams["connector"],
  datePreset: string,
): WindsorQueryParams {
  return {
    connector,
    fields: AD_PERFORMANCE_FIELDS,
    date_preset: datePreset,
  };
}

/** 取得每日趨勢資料 */
export function buildDailyTrendQuery(
  connector: WindsorQueryParams["connector"],
  datePreset: string,
): WindsorQueryParams {
  return {
    connector,
    fields: DAILY_TREND_FIELDS,
    date_preset: datePreset,
    date_aggregation: "day",
  };
}

/** 行銷活動總覽所需欄位（在成效欄位上加 Meta 活動預算，僅 Meta 有）*/
const INITIATIVE_FIELDS = [
  ...AD_PERFORMANCE_FIELDS,
  "campaign_lifetime_budget",
  "campaign_daily_budget",
  "campaign_budget_remaining",
];

/** 取得行銷活動總覽資料（含預算欄位）*/
export function buildInitiativeQuery(
  connector: WindsorQueryParams["connector"],
  datePreset: string,
): WindsorQueryParams {
  return {
    connector,
    fields: INITIATIVE_FIELDS,
    date_preset: datePreset,
  };
}

/** 取得廣告層級資料（用於素材疲勞偵測） */
export function buildAdLevelQuery(
  connector: WindsorQueryParams["connector"],
  datePreset: string,
): WindsorQueryParams {
  return {
    connector,
    fields: AD_PERFORMANCE_FIELDS,
    date_preset: datePreset,
  };
}

export { AD_PERFORMANCE_FIELDS, DAILY_TREND_FIELDS, INITIATIVE_FIELDS };

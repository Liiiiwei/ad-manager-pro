import { z } from "zod";

/** API 查詢參數 */
export interface WindsorQueryParams {
  connector: "facebook" | "google_ads" | "all";
  fields: string[];
  date_preset?: string;
  date_from?: string;
  date_to?: string;
  date_aggregation?: "day" | "week" | "month";
  filter?: string;
  _max_rows?: number;
}

/** 處理 null → 預設值的 helper */
const nullableString = (fallback: string) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? fallback);

const nullableNumber = () =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  });

/** 處理 website_purchase_roas 欄位（陣列或 null） */
const roasField = () =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (Array.isArray(v) && v.length > 0 && v[0]?.value) {
        const n = Number(v[0].value);
        return isNaN(n) ? 0 : n;
      }
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      return 0;
    });

/** Windsor API 原始回應 schema（含 Meta 特有欄位） */
const windsorRawSchema = z
  .object({
    date: z.string(),
    source: nullableString("unknown"),
    account_name: nullableString(""),
    campaign: nullableString(""),
    adset: nullableString(""),
    adset_name: nullableString(""),
    ad_name: nullableString(""),
    campaign_status: nullableString(""),
    adset_status: nullableString(""),
    ad_status: nullableString(""),
    spend: nullableNumber(),
    impressions: nullableNumber(),
    clicks: nullableNumber(),
    frequency: nullableNumber(),
    cpc: nullableNumber(),
    cpm: nullableNumber(),
    ctr: nullableNumber(),
    // Meta 轉換欄位
    actions_purchase: nullableNumber(),
    actions_add_to_cart: nullableNumber(),
    actions_initiate_checkout: nullableNumber(),
    actions_lead: nullableNumber(),
    actions_landing_page_view: nullableNumber(),
    action_values_omni_purchase: nullableNumber(),
    action_values_add_to_cart: nullableNumber(),
    website_purchase_roas: roasField(),
    // 通用欄位（部分 connector 可能有）
    conversions: nullableNumber(),
    revenue: nullableNumber(),
    roas: nullableNumber(),
  })
  .passthrough();

/** 正規化後的統一廣告資料型別 */
export interface WindsorAdRecord {
  date: string;
  source: string;
  account_name: string;
  campaign: string;
  adset: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  frequency: number;
  cpc: number;
  cpm: number;
  ctr: number;
  roas: number;
  // 電商指標
  purchases: number;
  addToCart: number;
  initiateCheckout: number;
  leads: number;
  purchaseValue: number;
  addToCartValue: number;
  // 投放狀態（ACTIVE / PAUSED / 其他）— 空字串代表未知
  campaignStatus: string;
  adsetStatus: string;
  adStatus: string;
}

/** 將 Windsor 原始資料正規化為統一格式 */
export function normalizeRecord(
  raw: z.infer<typeof windsorRawSchema>,
): WindsorAdRecord {
  const purchases = raw.actions_purchase || 0;
  const purchaseValue = raw.action_values_omni_purchase || 0;
  const wpRoas = raw.website_purchase_roas || 0;

  return {
    date: raw.date,
    // 將 IG/FB 統一視為 Meta 來源
    source:
      raw.source === "instagram" || raw.source === "facebook"
        ? "meta"
        : raw.source,
    account_name: raw.account_name,
    campaign: raw.campaign,
    // adset_name 為 Windsor API 實際回傳欄位，adset 為備援
    adset: raw.adset_name || raw.adset,
    ad_name: raw.ad_name,
    spend: raw.spend,
    impressions: raw.impressions,
    clicks: raw.clicks,
    frequency: raw.frequency,
    cpc: raw.cpc,
    cpm: raw.cpm,
    ctr: raw.ctr,
    // 正規化轉換：優先使用 Meta 特有欄位，備援使用通用欄位
    conversions: purchases || raw.conversions || 0,
    revenue: purchaseValue || raw.revenue || 0,
    roas: wpRoas || raw.roas || (raw.spend > 0 ? purchaseValue / raw.spend : 0),
    // 電商指標
    purchases,
    addToCart: raw.actions_add_to_cart || 0,
    initiateCheckout: raw.actions_initiate_checkout || 0,
    leads: raw.actions_lead || 0,
    purchaseValue,
    addToCartValue: raw.action_values_add_to_cart || 0,
    campaignStatus: (raw.campaign_status || "").toUpperCase(),
    adsetStatus: (raw.adset_status || "").toUpperCase(),
    adStatus: (raw.ad_status || "").toUpperCase(),
  };
}

export const windsorResponseSchema = z.object({
  data: z.array(windsorRawSchema),
  meta: z
    .object({
      total_count: z.number().optional(),
      returned_count: z.number().optional(),
    })
    .optional(),
});

export interface WindsorResponse {
  data: WindsorAdRecord[];
  meta?: {
    total_count?: number;
    returned_count?: number;
  };
}

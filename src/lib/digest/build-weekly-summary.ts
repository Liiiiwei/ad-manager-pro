import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { InitiativeRow } from "@/lib/initiatives/types";
import { aggregateInitiatives } from "@/lib/initiatives/transform";
import { taipeiDateString } from "@/lib/digest/build-daily-summary";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";

/**
 * 叮咚週報聚合（純函式）
 *
 * 設計原則：週報 = 日報基礎設施的平行複製版，不改任何日報程式碼。
 * 本檔照抄日報的 `taipeiDateString` 台北日界慣例與 `sum()` 加總模式，
 * 只把語意從「昨日單日 + 本月配速」換成「過去 7 天總量 + 對上週 WoW + campaign 排名」。
 */

/** 本週 / 上週各 7 天窗口（YYYY-MM-DD，台北，皆含頭尾） */
export interface WeekWindows {
  /** 本週起日（= 昨日往前推 6 天） */
  weekStart: string;
  /** 本週迄日（= 昨日） */
  weekEnd: string;
  /** 上週起日 */
  lastWeekStart: string;
  /** 上週迄日（= 本週起日的前一天） */
  lastWeekEnd: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 從「今天」推導本週 / 上週兩個 7 天窗口。
 * 以「昨日」為本週迄日（同日報基準日一律取昨日），本週 = 昨日往前 7 天（含昨日），
 * 上週 = 再往前 7 天。台北無日光節約時間，24h 相減安全（同 deriveDigestDates 手法）。
 */
export function deriveWeekWindows(now: Date): WeekWindows {
  const todayStr = taipeiDateString(now);
  // 先落到台北當日 00:00，再減一天取得昨日
  const todayTaipei = new Date(`${todayStr}T00:00:00+08:00`);
  const yesterdayDate = new Date(todayTaipei.getTime() - DAY_MS);

  const weekEnd = taipeiDateString(yesterdayDate);
  const weekStartDate = new Date(yesterdayDate.getTime() - 6 * DAY_MS);
  const weekStart = taipeiDateString(weekStartDate);

  const lastWeekEndDate = new Date(weekStartDate.getTime() - DAY_MS);
  const lastWeekEnd = taipeiDateString(lastWeekEndDate);
  const lastWeekStartDate = new Date(lastWeekEndDate.getTime() - 6 * DAY_MS);
  const lastWeekStart = taipeiDateString(lastWeekStartDate);

  return { weekStart, weekEnd, lastWeekStart, lastWeekEnd };
}

/** 單一 7 天窗口的總量 */
export interface WeekTotals {
  spend: number;
  conversions: number;
  revenue: number;
  /** revenue/spend，spend=0 → null（沿用日報 null 慣例） */
  roas: number | null;
  /** spend/conversions，conversions=0 → null */
  cpa: number | null;
}

/** 由 aggregateInitiatives 降維而來的活動排名列 */
export interface CampaignRank {
  name: string;
  spend: number;
  roas: number;
  cpa: number;
}

/** 週報結果 */
export interface WeeklySummary {
  /** 本週窗口起日 YYYY-MM-DD（台北） */
  weekStart: string;
  /** 本週窗口迄日 YYYY-MM-DD（台北） */
  weekEnd: string;
  thisWeek: WeekTotals;
  lastWeek: WeekTotals;
  /** WoW：(本-上)/上 × 100（百分比數值）；上週基準為 0 或 null → null */
  wow: {
    spendPct: number | null;
    roasPct: number | null;
    cpaPct: number | null;
    convPct: number | null;
  };
  /** 本週 spend≥門檻中 ROAS 最高的活動；無合格活動 → null */
  bestCampaign: CampaignRank | null;
  /** 本週 spend≥門檻中 ROAS 最低的活動；無合格活動 → null */
  worstCampaign: CampaignRank | null;
}

/** buildWeeklySummary 選項 */
export interface WeeklySummaryOptions {
  /** 「今天」（測試可注入固定時間）；窗口全由此推導 */
  now: Date;
  /**
   * 最佳/最差活動的花費門檻（避免拿花很少的活動當「最佳」）。
   * 預設借用分析引擎的 minSpendForDecision，不硬寫魔術常數。
   */
  minSpend?: number;
}

/** 加總指定數值欄位（同 build-daily-summary 的 sum 模式） */
function sum(
  records: WindsorAdRecord[],
  field: "spend" | "revenue" | "conversions",
): number {
  return records.reduce((total, r) => total + (r[field] || 0), 0);
}

/** 對單一窗口的 records 算總量（除零一律回 null，沿用日報慣例） */
function computeTotals(records: WindsorAdRecord[]): WeekTotals {
  const spend = sum(records, "spend");
  const conversions = sum(records, "conversions");
  const revenue = sum(records, "revenue");
  return {
    spend,
    conversions,
    revenue,
    roas: spend > 0 ? revenue / spend : null,
    cpa: conversions > 0 ? spend / conversions : null,
  };
}

/** WoW 百分比：(本-上)/上 × 100；上週基準為 null 或 0 → null（無從比較） */
function wowPct(
  current: number | null,
  previous: number | null,
): number | null {
  if (previous === null || previous === 0) return null;
  const cur = current ?? 0;
  return ((cur - previous) / previous) * 100;
}

/** InitiativeRow → CampaignRank（活動以「帳號＋前綴」為粒度，name 取前綴） */
function toCampaignRank(row: InitiativeRow): CampaignRank {
  return { name: row.prefix, spend: row.spend, roas: row.roas, cpa: row.cpa };
}

/**
 * 從 Windsor 記錄彙整週報（純函式）。
 * 窗口由 options.now 推導，records 內用字串日期比較切成本週/上週兩窗
 * （同日報「抓 60d 再 filter」手法，不引入新查詢參數）。
 */
export function buildWeeklySummary(
  records: WindsorAdRecord[],
  options: WeeklySummaryOptions,
): WeeklySummary {
  const w = deriveWeekWindows(options.now);
  const minSpend =
    options.minSpend ?? DEFAULT_THRESHOLDS.recommendation.minSpendForDecision;

  // 字串比較對 YYYY-MM-DD 成立（同 build-daily-summary 的月區間 filter）
  const thisWeekRecords = records.filter(
    (r) => r.date >= w.weekStart && r.date <= w.weekEnd,
  );
  const lastWeekRecords = records.filter(
    (r) => r.date >= w.lastWeekStart && r.date <= w.lastWeekEnd,
  );

  const thisWeek = computeTotals(thisWeekRecords);
  const lastWeek = computeTotals(lastWeekRecords);

  const wow = {
    spendPct: wowPct(thisWeek.spend, lastWeek.spend),
    roasPct: wowPct(thisWeek.roas, lastWeek.roas),
    cpaPct: wowPct(thisWeek.cpa, lastWeek.cpa),
    convPct: wowPct(thisWeek.conversions, lastWeek.conversions),
  };

  // 最佳/最差活動：對本週 records 跑既有 aggregateInitiatives，過濾花費門檻後取 ROAS 極值
  const ranked = aggregateInitiatives(thisWeekRecords).filter(
    (r) => r.spend >= minSpend,
  );
  let bestCampaign: CampaignRank | null = null;
  let worstCampaign: CampaignRank | null = null;
  if (ranked.length > 0) {
    const best = ranked.reduce((a, b) => (b.roas > a.roas ? b : a));
    const worst = ranked.reduce((a, b) => (b.roas < a.roas ? b : a));
    bestCampaign = toCampaignRank(best);
    worstCampaign = toCampaignRank(worst);
  }

  return {
    weekStart: w.weekStart,
    weekEnd: w.weekEnd,
    thisWeek,
    lastWeek,
    wow,
    bestCampaign,
    worstCampaign,
  };
}

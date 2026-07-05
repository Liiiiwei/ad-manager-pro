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

/** 單一帳號的本週表現（分帳號週報卡片一列一個） */
export interface AccountWeekly {
  /** 帳號名稱（= Windsor account_name，空值墊「未命名帳戶」） */
  accountName: string;
  /** 平台標籤（Meta / Google / 其他） */
  platform: string;
  /** 本週該帳號花費 */
  thisWeekSpend: number;
  /** 花費 WoW（%）；上週該帳號花費為 0/無 → null */
  spendWow: number | null;
  /** 本週配速 = 本週花費 ÷ 本週應花（0~1+）；無月預算 → null */
  weekProgress: number | null;
  /** 週配速預算來源；目前僅手動月預算（accountBudgets），無預算 → null */
  budgetSource: "manual" | null;
  /** 本週 ROAS；花費 0 → null */
  roas: number | null;
  /** 本週轉換數 */
  conversions: number;
  /** 本週 CPA；轉換 0 → null */
  cpa: number | null;
  /** CPA WoW（%）；上週該帳號 CPA 無 → null */
  cpaWow: number | null;
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
  /** 分帳號本週表現（依本週花費由高到低） */
  accounts: AccountWeekly[];
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
  /**
   * 帳號名稱 → 手動月預算（原幣別），用於算各帳號週配速。
   * 呼叫端以 mergeAccountBudgets(settings.accountBudgets) 淨化後帶入。
   * 省略或某帳號無值 → 該帳號 weekProgress = null（未設定預算）。
   */
  manualBudgets?: Record<string, number>;
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
 * source → 平台標籤。
 * 為維持 initiatives/transform.ts 的 platformLabel（module-private 未 export）一字不動，
 * 這裡照抄一份等價邏輯；若日後平台分類規則變更，兩處需一起改。
 */
function platformLabel(source: string): string {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) {
    return "Meta";
  }
  if (s.includes("google")) return "Google";
  return source || "其他";
}

/**
 * 「本週應花」= 月預算 × 7 ÷ 當月天數（當月 = date 所屬台北月份）。
 * monthBudget ≤ 0 → null（無預算不配速）。
 * 刻意獨立成函式：日後若要改成「月累計」等其它配速語意，只需改這裡。
 */
export function weeklyPaceBudget(
  monthBudget: number,
  date: Date,
): number | null {
  if (monthBudget <= 0) return null;
  const [year, month] = taipeiDateString(date).split("-").map(Number);
  // new Date(y, m, 0) = 該月最後一天（m 為 1-based），getDate() 得當月天數
  const daysInMonth = new Date(year, month, 0).getDate();
  return (monthBudget * 7) / daysInMonth;
}

/** 單一窗口內、以帳號為粒度的累加中繼 */
interface AccountAgg {
  accountName: string;
  /** 該帳號任一筆記錄的 source（同帳號平台一致） */
  source: string;
  spend: number;
  revenue: number;
  conversions: number;
}

/** 把窗口內的 records 依 account_name 分組加總（空帳號名墊「未命名帳戶」，同 transform 慣例） */
function aggregateByAccount(
  records: WindsorAdRecord[],
): Map<string, AccountAgg> {
  const map = new Map<string, AccountAgg>();
  for (const r of records) {
    const accountName = r.account_name?.trim() || "未命名帳戶";
    let acc = map.get(accountName);
    if (!acc) {
      acc = {
        accountName,
        source: r.source,
        spend: 0,
        revenue: 0,
        conversions: 0,
      };
      map.set(accountName, acc);
    }
    acc.spend += r.spend || 0;
    acc.revenue += r.revenue || 0;
    acc.conversions += r.conversions || 0;
  }
  return map;
}

/**
 * 組出分帳號本週表現：以「本週有資料」的帳號為主體，
 * 對上週同名帳號取數算 WoW，並用 weeklyPaceBudget 算週配速。
 * 依本週花費由高到低排序。
 */
function buildAccounts(
  thisWeekRecords: WindsorAdRecord[],
  lastWeekRecords: WindsorAdRecord[],
  manualBudgets: Record<string, number>,
  now: Date,
): AccountWeekly[] {
  const thisAgg = aggregateByAccount(thisWeekRecords);
  const lastAgg = aggregateByAccount(lastWeekRecords);

  const result: AccountWeekly[] = [];
  for (const acc of thisAgg.values()) {
    const roas = acc.spend > 0 ? acc.revenue / acc.spend : null;
    const cpa = acc.conversions > 0 ? acc.spend / acc.conversions : null;

    const last = lastAgg.get(acc.accountName);
    const lastSpend = last?.spend ?? 0;
    const lastCpa =
      last && last.conversions > 0 ? last.spend / last.conversions : null;

    const monthBudget = manualBudgets[acc.accountName] ?? 0;
    const pace = weeklyPaceBudget(monthBudget, now);

    result.push({
      accountName: acc.accountName,
      platform: platformLabel(acc.source),
      thisWeekSpend: acc.spend,
      spendWow: wowPct(acc.spend, lastSpend),
      weekProgress: pace !== null ? acc.spend / pace : null,
      budgetSource: pace !== null ? "manual" : null,
      roas,
      conversions: acc.conversions,
      cpa,
      cpaWow: wowPct(cpa, lastCpa),
    });
  }

  return result.sort((a, b) => b.thisWeekSpend - a.thisWeekSpend);
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

  const accounts = buildAccounts(
    thisWeekRecords,
    lastWeekRecords,
    options.manualBudgets ?? {},
    options.now,
  );

  return {
    weekStart: w.weekStart,
    weekEnd: w.weekEnd,
    thisWeek,
    lastWeek,
    wow,
    bestCampaign,
    worstCampaign,
    accounts,
  };
}

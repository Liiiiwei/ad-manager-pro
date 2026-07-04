import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { TriggeredAlert } from "@/lib/alerts/types";
import { aggregateAccounts } from "@/lib/initiatives/transform";
import type { AccountSummary } from "@/lib/initiatives/types";

/** 以台北時區輸出 YYYY-MM-DD（sv locale 天生是 ISO 格式） */
export function taipeiDateString(d: Date): string {
  return d.toLocaleDateString("sv", { timeZone: "Asia/Taipei" });
}

/** 摘要基準日期組（一律以「昨日」為基準；月份取昨日所屬月份） */
export interface DigestDates {
  /** 昨日（台北）YYYY-MM-DD */
  yesterday: string;
  /** 昨日所屬月份的 1 號 YYYY-MM-DD */
  monthStart: string;
  /** 昨日是當月第幾天 */
  dayOfMonth: number;
  /** 昨日所屬月份的天數 */
  daysInMonth: number;
}

/** 從「今天」推導摘要的各基準日期 */
export function deriveDigestDates(today: Date): DigestDates {
  const todayStr = taipeiDateString(today);
  // 先落到台北當日 00:00，再減一天取得昨日
  const todayTaipei = new Date(`${todayStr}T00:00:00+08:00`);
  const yesterdayDate = new Date(todayTaipei.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = taipeiDateString(yesterdayDate);

  const [year, month, day] = yesterday.split("-").map(Number);
  return {
    yesterday,
    monthStart: `${yesterday.slice(0, 7)}-01`,
    dayOfMonth: day,
    // new Date(y, m, 0) = 該月最後一天（m 為 1-based 月份）
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

/** buildDailySummary 選項 */
export interface DailySummaryOptions {
  /** 帳號名稱 → 手動月預算（原幣別） */
  manualBudgets: Record<string, number>;
  /** 「今天」（測試可注入固定時間） */
  today: Date;
  /** 昨日所屬月份天數（呼叫端以 deriveDigestDates 取得） */
  daysInMonth: number;
  /** 已觸發的異常（可選，摘要僅呈現件數與內容） */
  alerts?: TriggeredAlert[];
}

/** 每日摘要結果 */
export interface DailySummary {
  /** 基準日（昨日）YYYY-MM-DD */
  date: string;
  /** 昨日全帳號花費 */
  yesterdaySpend: number;
  /** 昨日 ROAS（花費為 0 → null） */
  yesterdayRoas: number | null;
  /** 昨日 CPA（轉換為 0 → null） */
  yesterdayCpa: number | null;
  /** 本月（1 號～昨日）全帳號花費 */
  monthSpend: number;
  /** 有設定預算帳號的期間預算加總 */
  monthBudget: number;
  /** 有預算帳號花費 ÷ monthBudget；無任何預算 → null */
  monthProgress: number | null;
  /** 帳號層級配速明細（依花費由高到低） */
  accounts: AccountSummary[];
  /** 異常清單（options.alerts 原樣帶出） */
  alerts: TriggeredAlert[];
}

/** 加總指定數值欄位 */
function sum(
  records: WindsorAdRecord[],
  field: "spend" | "revenue" | "conversions",
): number {
  return records.reduce((total, r) => total + (r[field] || 0), 0);
}

/**
 * 從 Windsor 記錄彙整每日摘要（純函式）
 * 基準日一律是「昨日」；本月 = 昨日所屬月份 1 號～昨日。
 */
export function buildDailySummary(
  records: WindsorAdRecord[],
  options: DailySummaryOptions,
): DailySummary {
  const dates = deriveDigestDates(options.today);

  // 昨日指標
  const yesterdayRecords = records.filter((r) => r.date === dates.yesterday);
  const yesterdaySpend = sum(yesterdayRecords, "spend");
  const yesterdayRevenue = sum(yesterdayRecords, "revenue");
  const yesterdayConversions = sum(yesterdayRecords, "conversions");
  const yesterdayRoas =
    yesterdaySpend > 0 ? yesterdayRevenue / yesterdaySpend : null;
  const yesterdayCpa =
    yesterdayConversions > 0 ? yesterdaySpend / yesterdayConversions : null;

  // 本月（字串比較對 YYYY-MM-DD 成立）
  const monthRecords = records.filter(
    (r) => r.date >= dates.monthStart && r.date <= dates.yesterday,
  );
  const monthSpend = sum(monthRecords, "spend");

  // 帳號配速：重用 /initiatives 的彙整（含手動月預算換算）
  const accounts = aggregateAccounts(monthRecords, dates.dayOfMonth, {
    manualBudgets: options.manualBudgets,
    daysInMonth: options.daysInMonth,
  });

  const budgeted = accounts.filter((a) => a.hasBudget);
  const monthBudget = budgeted.reduce((total, a) => total + a.periodBudget, 0);
  const budgetedSpend = budgeted.reduce((total, a) => total + a.spend, 0);
  const monthProgress = monthBudget > 0 ? budgetedSpend / monthBudget : null;

  return {
    date: dates.yesterday,
    yesterdaySpend,
    yesterdayRoas,
    yesterdayCpa,
    monthSpend,
    monthBudget,
    monthProgress,
    accounts,
    alerts: options.alerts ?? [],
  };
}

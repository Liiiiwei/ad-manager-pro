import type { AccountSummary } from "@/lib/initiatives/types";

/** 配速超支門檻（比值為「本月累計花費 ÷ 當期應花額度」）*/
export interface PacingThresholds {
  /** 超過此值即 warning（嚴格大於）*/
  warning: number;
  /** 超過此值即 critical（嚴格大於）*/
  critical: number;
}

/** 一筆配速超支 */
export interface PacingViolation {
  accountName: string;
  platform: string;
  severity: "warning" | "critical";
  monthSpend: number;
  periodBudget: number;
  pacingRatio: number;
  monthlyBudget: number;
}

const DEFAULT_THRESHOLDS: PacingThresholds = { warning: 1.1, critical: 1.25 };

/**
 * 從帳號配速摘要偵測超支。只檢查有設「手動月預算」的帳號；
 * a.progress 已是 spend / periodBudget（見 buildDailySummary）。
 */
export function detectPacingOverspend(
  accounts: AccountSummary[],
  thresholds: PacingThresholds = DEFAULT_THRESHOLDS,
): PacingViolation[] {
  const violations: PacingViolation[] = [];
  for (const a of accounts) {
    if (a.budgetSource !== "manual" || a.monthlyBudget == null || a.periodBudget <= 0) {
      continue;
    }
    const ratio = a.progress;
    if (ratio <= thresholds.warning) continue;
    const severity: "warning" | "critical" =
      ratio > thresholds.critical ? "critical" : "warning";
    violations.push({
      accountName: a.accountName,
      platform: a.platform,
      severity,
      monthSpend: a.spend,
      periodBudget: a.periodBudget,
      pacingRatio: ratio,
      monthlyBudget: a.monthlyBudget,
    });
  }
  return violations;
}

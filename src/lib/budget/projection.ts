/** 月底落點預測輸入（只對有手動月預算的帳號有意義） */
export interface EomProjectionInput {
  /** 本月（1 號～昨日）累計花費 */
  monthSpend: number;
  /** 已過天數（昨日是當月第幾天） */
  elapsedDays: number;
  /** 當月天數 */
  daysInMonth: number;
  /** 手動月預算（原幣別） */
  monthlyBudget: number;
}

/** 月底落點預測結果 */
export interface EomProjection {
  /** 照目前日均推估的月底總花費；elapsedDays ≤ 0 或 daysInMonth ≤ 0 無法推估 → null */
  projectedEomSpend: number | null;
  /** projectedEomSpend ÷ monthlyBudget；無法推估或月預算 ≤ 0 → null */
  projectedRatio: number | null;
  /**
   * 剩餘天數的建議日均花費 =（月預算 − 已花）÷ 剩餘天數。
   * - 剩餘 0 天（含負）→ null（月底已到，沒有可調整的日均）
   * - 預算已爆（已花 ≥ 月預算）→ 0（剩餘日應停止花費）
   */
  suggestedDailySpend: number | null;
}

/**
 * 月底落點預測（純函式）：
 * 以「本月至今日均 × 當月天數」線性外推月底總花費，
 * 並回推剩餘天數要守住月預算的建議日均。
 */
export function projectEndOfMonth(input: EomProjectionInput): EomProjection {
  const { monthSpend, elapsedDays, daysInMonth, monthlyBudget } = input;

  // 無效輸入（月份天數 ≤ 0）一律回 null，不做猜測
  if (daysInMonth <= 0) {
    return {
      projectedEomSpend: null,
      projectedRatio: null,
      suggestedDailySpend: null,
    };
  }

  // 已過 0 天 → 沒有日均可外推
  const projectedEomSpend =
    elapsedDays > 0 ? (monthSpend / elapsedDays) * daysInMonth : null;

  const projectedRatio =
    projectedEomSpend !== null && monthlyBudget > 0
      ? projectedEomSpend / monthlyBudget
      : null;

  const remainingDays = daysInMonth - elapsedDays;
  let suggestedDailySpend: number | null;
  if (remainingDays <= 0) {
    // 月底已到（或輸入異常的過月）→ 無日均可調
    suggestedDailySpend = null;
  } else {
    // 預算已爆 → 建議日均 0（不回負數）
    suggestedDailySpend = Math.max(
      0,
      (monthlyBudget - monthSpend) / remainingDays,
    );
  }

  return { projectedEomSpend, projectedRatio, suggestedDailySpend };
}

import { z } from "zod";

/**
 * 帳號手動月預算的 PATCH 驗證 schema。
 * key = 帳號名稱（account_name）；value = 月預算（原幣別）；
 * value 為 null 表示刪除該帳號的手動預算。
 */
export const accountBudgetsSchema = z.record(
  z.string().min(1).max(200),
  z.number().positive().max(1e9).nullable(),
);

export type AccountBudgetsPatch = z.infer<typeof accountBudgetsSchema>;

/**
 * merge 語意：只動 patch 有的 key；null 刪除、數字覆寫；
 * existing 非物件或值非正數時視為不存在（防 DB 殘留髒資料）。
 */
export function mergeAccountBudgets(
  existing: unknown,
  patch: AccountBudgetsPatch,
): Record<string, number> {
  const base: Record<string, number> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [k, v] of Object.entries(existing)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        base[k] = v;
      }
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return base;
}

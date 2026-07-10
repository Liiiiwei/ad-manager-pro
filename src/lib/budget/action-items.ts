import { prisma } from "@/lib/db/prisma";
import type { AccountSummary } from "@/lib/initiatives/types";
import {
  DEFAULT_THRESHOLDS,
  type PacingThresholds,
  type PacingViolation,
} from "./pacing";

/** 回正結案的理由（寫入 detail.resolvedReason） */
type RecoveryReason = "pacing_recovered" | "manual_budget_removed";

/** 既有 detail 是未驗證 JSON，先淨化成物件再合併回正資訊 */
function asDetailObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * 同步配速待辦：同一 userId + accountName + reason=pacing_overspend + status=open
 * 已存在則更新（去重，不新增），否則新建。
 *
 * 另做「回正自動結案」：open 待辦的帳號本次已不在超支名單時——
 * - 本次有觀測到該帳號且配速 < warning 門檻 → 標 resolved（resolvedBy="pacing_recovered"），
 *   detail 記錄回正時的 recoveredRatio
 * - 手動月預算已被移除（budgetSource 不再是 manual）→ 超支判定不再適用，同樣結案，
 *   detail.resolvedReason 記 "manual_budget_removed"
 * - 本次數據抓不到該帳號 → 不動它（避免資料缺漏誤關）
 *
 * 回傳同步後該 user open 的 pacing 待辦總數。
 */
export async function syncPacingActionItems(
  userId: string,
  violations: PacingViolation[],
  observedAccounts?: AccountSummary[],
  thresholds: PacingThresholds = DEFAULT_THRESHOLDS,
): Promise<number> {
  const existing = await prisma.budgetActionItem.findMany({
    where: { userId, reason: "pacing_overspend", status: "open" },
  });
  const openByAccount = new Map(existing.map((i) => [i.accountName, i]));

  for (const v of violations) {
    const detail = {
      monthSpend: v.monthSpend,
      periodBudget: v.periodBudget,
      pacingRatio: v.pacingRatio,
      monthlyBudget: v.monthlyBudget,
    };
    const current = openByAccount.get(v.accountName);
    if (current) {
      await prisma.budgetActionItem.update({
        where: { id: current.id },
        data: { severity: v.severity, platform: v.platform, detail },
      });
    } else {
      await prisma.budgetActionItem.create({
        data: {
          userId,
          reason: "pacing_overspend",
          platform: v.platform,
          accountName: v.accountName,
          severity: v.severity,
          detail,
        },
      });
    }
  }

  // 回正自動結案（只有帶入本次觀測帳號時才執行）
  if (observedAccounts) {
    const violatedNames = new Set(violations.map((v) => v.accountName));
    const accountByName = new Map(
      observedAccounts.map((a) => [a.accountName, a]),
    );

    for (const item of existing) {
      if (violatedNames.has(item.accountName)) continue; // 仍在超支中
      const account = accountByName.get(item.accountName);
      if (!account) continue; // 本次數據抓不到 → 不動，避免誤關

      let resolvedReason: RecoveryReason | null = null;
      let recoveredRatio: number | null = null;
      if (account.budgetSource !== "manual" || account.monthlyBudget == null) {
        // 手動月預算已移除 → 超支判定基準消失，視為回正結案
        resolvedReason = "manual_budget_removed";
      } else if (account.progress < thresholds.warning) {
        resolvedReason = "pacing_recovered";
        recoveredRatio = account.progress;
      }
      // 恰好等於門檻（不觸發超支也未低於門檻）→ 保守維持 open
      if (!resolvedReason) continue;

      await prisma.budgetActionItem.update({
        where: { id: item.id },
        data: {
          status: "resolved",
          resolvedBy: "pacing_recovered",
          resolvedAt: new Date(),
          detail: {
            ...asDetailObject(item.detail),
            resolvedReason,
            recoveredRatio,
          },
        },
      });
    }
  }

  return prisma.budgetActionItem.count({
    where: { userId, reason: "pacing_overspend", status: "open" },
  });
}

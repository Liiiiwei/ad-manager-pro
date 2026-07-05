import { prisma } from "@/lib/db/prisma";
import type { PacingViolation } from "./pacing";

/**
 * 同步配速待辦：同一 userId + accountName + reason=pacing_overspend + status=open
 * 已存在則更新（去重，不新增），否則新建。
 * 回傳同步後該 user open 的 pacing 待辦總數。
 */
export async function syncPacingActionItems(
  userId: string,
  violations: PacingViolation[],
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

  return prisma.budgetActionItem.count({
    where: { userId, reason: "pacing_overspend", status: "open" },
  });
}

import { prisma } from "@/lib/db/prisma";

/** 一筆帳號月預算變更（newValue 為 null 代表移除）*/
export interface AccountBudgetChange {
  accountName: string;
  previousValue: number | null;
  newValue: number | null;
}

/** 比對前後帳號月預算表，回傳有變化的帳號 */
export function diffAccountBudgets(
  previous: Record<string, number>,
  next: Record<string, number>,
): AccountBudgetChange[] {
  const changes: AccountBudgetChange[] = [];
  const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const name of names) {
    const prev = name in previous ? previous[name] : null;
    const nv = name in next ? next[name] : null;
    if (prev === nv) continue;
    changes.push({ accountName: name, previousValue: prev, newValue: nv });
  }
  return changes;
}

/** 寫入手動月預算變更紀錄並同步 account_monthly 快照 */
export async function logAccountBudgetChanges(
  userId: string,
  changes: AccountBudgetChange[],
): Promise<void> {
  for (const ch of changes) {
    const removed = ch.newValue == null;
    const changePercent =
      ch.previousValue != null && ch.previousValue !== 0 && ch.newValue != null
        ? ((ch.newValue - ch.previousValue) / ch.previousValue) * 100
        : null;
    await prisma.budgetChangeLog.create({
      data: {
        userId,
        source: "manual_account_budget",
        scope: "account_monthly",
        platform: "manual",
        entityKey: ch.accountName,
        entityLabel: ch.accountName,
        budgetType: "monthly_manual",
        previousValue: ch.previousValue,
        newValue: ch.newValue ?? 0, // 移除以 0 表示（schema newValue 非 null）
        changePercent,
        note: removed ? "已移除月預算" : undefined,
      },
    });

    if (removed) {
      await prisma.budgetSnapshot.deleteMany({
        where: {
          userId,
          scope: "account_monthly",
          entityKey: ch.accountName,
          budgetType: "monthly_manual",
        },
      });
    } else {
      await prisma.budgetSnapshot.upsert({
        where: {
          userId_scope_entityKey_budgetType: {
            userId,
            scope: "account_monthly",
            entityKey: ch.accountName,
            budgetType: "monthly_manual",
          },
        },
        create: {
          userId,
          scope: "account_monthly",
          platform: "manual",
          entityKey: ch.accountName,
          entityLabel: ch.accountName,
          budgetType: "monthly_manual",
          budgetValue: ch.newValue!,
        },
        update: { budgetValue: ch.newValue!, capturedAt: new Date() },
      });
    }
  }
}

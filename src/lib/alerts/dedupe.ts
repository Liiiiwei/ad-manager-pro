import { prisma } from "@/lib/db/prisma";
import type { AlertNotification } from "@prisma/client";
import type { TriggeredAlert } from "@/lib/alerts/types";

/** 以台北時區取得「當天 00:00」的時間點 */
export function taipeiStartOfDay(now: Date = new Date()): Date {
  const today = now.toLocaleDateString("sv", { timeZone: "Asia/Taipei" });
  return new Date(`${today}T00:00:00+08:00`);
}

/** 去重寫入結果 */
export interface SaveNotificationsResult {
  /** 本次「新寫入」對應的觸發（今日已通知過的規則不在內） */
  newAlerts: TriggeredAlert[];
  /** 本次新寫入的通知記錄 */
  notifications: AlertNotification[];
}

/**
 * 儲存新觸發的通知（每日去重：同一規則台北當日只寫入一次）
 * API 路由與 cron 任務共用；cron 依 newAlerts 是否為空決定要不要推播。
 */
export async function saveNewAlertNotifications(
  userId: string,
  triggeredAlerts: TriggeredAlert[],
  now: Date = new Date(),
): Promise<SaveNotificationsResult> {
  if (triggeredAlerts.length === 0) {
    return { newAlerts: [], notifications: [] };
  }

  const startOfDay = taipeiStartOfDay(now);
  const ruleIds = triggeredAlerts.map((a) => a.ruleId);

  // 批次查詢今日已存在的通知，避免 N+1 問題
  const existingToday = await prisma.alertNotification.findMany({
    where: {
      ruleId: { in: ruleIds },
      userId,
      createdAt: { gte: startOfDay },
    },
    select: { ruleId: true },
  });
  const existingRuleIds = new Set(
    existingToday.map((n: { ruleId: string }) => n.ruleId),
  );

  const newAlerts: TriggeredAlert[] = [];
  const notifications: AlertNotification[] = [];

  for (const alert of triggeredAlerts) {
    if (existingRuleIds.has(alert.ruleId)) continue;

    const notification = await prisma.alertNotification.create({
      data: {
        ruleId: alert.ruleId,
        userId,
        title: alert.title,
        message: alert.message,
        metric: alert.metric,
        currentValue: alert.currentValue,
        previousValue: alert.previousValue,
        changePercent: alert.changePercent,
        severity: alert.severity,
        read: false,
      },
    });
    newAlerts.push(alert);
    notifications.push(notification);
  }

  return { newAlerts, notifications };
}

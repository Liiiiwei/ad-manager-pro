import { prisma } from "@/lib/db/prisma";
import { SyncSchedule } from "@prisma/client";
import { CronExpressionParser } from "cron-parser";

/**
 * 取得使用者的排程設定
 */
export async function getSyncSchedule(
  userId: string,
): Promise<SyncSchedule | null> {
  return await prisma.syncSchedule.findFirst({
    where: { userId },
  });
}

/**
 * 建立或更新排程
 */
export async function upsertSyncSchedule(
  userId: string,
  data: {
    cronExpression: string;
    timezone?: string;
    enabled?: boolean;
  },
): Promise<SyncSchedule> {
  // 計算下次執行時間
  const nextRunAt = calculateNextRun(
    data.cronExpression,
    data.timezone || "UTC",
  );

  const existing = await getSyncSchedule(userId);

  if (!existing) {
    return await prisma.syncSchedule.create({
      data: {
        userId,
        cronExpression: data.cronExpression,
        timezone: data.timezone || "UTC",
        enabled: data.enabled ?? true,
        nextRunAt,
      },
    });
  }

  return await prisma.syncSchedule.update({
    where: { id: existing.id },
    data: {
      cronExpression: data.cronExpression,
      timezone: data.timezone,
      enabled: data.enabled,
      nextRunAt,
    },
  });
}

/**
 * 取得所有啟用的排程（供 Cron 使用）
 */
export async function getActiveSchedules() {
  return await prisma.syncSchedule.findMany({
    where: { enabled: true },
    include: { user: true },
  });
}

/**
 * 更新排程的執行時間
 */
export async function updateScheduleRunTime(
  scheduleId: string,
  lastRunAt: Date,
  nextRunAt: Date,
): Promise<void> {
  await prisma.syncSchedule.update({
    where: { id: scheduleId },
    data: { lastRunAt, nextRunAt },
  });
}

/**
 * 計算下次執行時間
 */
function calculateNextRun(cronExpression: string, timezone: string): Date {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (error) {
    console.error("無效的 Cron 表達式:", error);
    // 預設 24 小時後
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
}

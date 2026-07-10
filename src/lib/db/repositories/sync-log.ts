import { prisma } from "@/lib/db/prisma";
import { SyncLog } from "@prisma/client";

/**
 * 建立同步記錄（開始）
 * @param jobType 任務種類（預設 "page_sync"＝既有日報頁面同步；Notion database 同步用 "notion_db_sync"）
 */
export async function createSyncLog(
  userId: string,
  jobType: string = "page_sync",
): Promise<SyncLog> {
  return await prisma.syncLog.create({
    data: {
      userId,
      status: "RUNNING",
      jobType,
    },
  });
}

/**
 * 更新同步記錄（成功）
 */
export async function completeSyncLog(
  logId: string,
  data: {
    notionPageId: string;
    adsAnalyzed: number;
    alertsDetected: number;
    overallRoas: number;
  },
): Promise<SyncLog> {
  return await prisma.syncLog.update({
    where: { id: logId },
    data: {
      status: "SUCCESS",
      completedAt: new Date(),
      ...data,
    },
  });
}

/**
 * 更新同步記錄（失敗）
 */
export async function failSyncLog(
  logId: string,
  errorMessage: string,
): Promise<SyncLog> {
  return await prisma.syncLog.update({
    where: { id: logId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage,
    },
  });
}

/**
 * 取得使用者的同步歷史記錄
 */
export async function getSyncHistory(
  userId: string,
  limit: number = 20,
): Promise<SyncLog[]> {
  return await prisma.syncLog.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";
import { createNotionPage } from "@/lib/notion/page-sync";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { decryptApiKey } from "@/lib/utils/crypto";
import {
  updateScheduleRunTime,
  getSyncSchedule,
} from "@/lib/db/repositories/sync-schedule";
import {
  createSyncLog,
  completeSyncLog,
  failSyncLog,
} from "@/lib/db/repositories/sync-log";
import { CronExpressionParser } from "cron-parser";

/**
 * 執行個別使用者的 Notion 同步任務
 * 手動觸發時 scheduleId 可省略
 *
 * options.throwOnError：
 *   - false（預設，cron 觸發）：失敗只寫 failSyncLog，不往外丟，避免單一使用者失敗中斷整個排程
 *   - true（手動 API 觸發）：寫完 failSyncLog 後再 re-throw，讓路由能回傳真正的失敗狀態而非誤導性 200
 */
export async function executeSyncForUser(
  userId: string,
  scheduleId?: string,
  options?: { throwOnError?: boolean },
): Promise<void> {
  const throwOnError = options?.throwOnError ?? false;
  // 建立同步記錄
  const syncLog = await createSyncLog(userId);

  try {
    // 1. 取得使用者設定
    const settings = await getUserSettings(userId);

    if (!settings) {
      throw new Error("找不到使用者設定");
    }

    // 檢查是否啟用自動同步（失敗統一由 catch 寫 failSyncLog）
    if (!settings.notionEnabled) {
      throw new Error("自動同步已停用");
    }

    // 2. 驗證必要設定並解密 API Key
    const windsorApiKey = settings.windsorApiKey
      ? decryptApiKey(settings.windsorApiKey)
      : null;
    const notionApiKey = settings.notionApiKey
      ? decryptApiKey(settings.notionApiKey)
      : null;
    const parentPageId = settings.notionParentPageId;

    if (!windsorApiKey) {
      throw new Error("缺少 Windsor API Key");
    }
    if (!notionApiKey) {
      throw new Error("缺少 Notion API Key");
    }
    if (!parentPageId) {
      throw new Error("缺少 Notion Parent Page ID");
    }

    const dateRange = settings.windsorDateRange || "last_7d";

    // 3. 取得 Windsor 廣告資料
    const query = buildAdPerformanceQuery("all", dateRange);
    const response = await fetchWindsor(windsorApiKey, query);

    // 4. 執行分析
    // 使用儲存的閾值或預設值
    const thresholds: AnalysisThresholds = settings.thresholds
      ? (structuredClone(settings.thresholds) as unknown as AnalysisThresholds)
      : DEFAULT_THRESHOLDS;

    const analysis = runFullAnalysis(response.data, thresholds);

    // 5. 產生報告內容
    const reportTitle = buildReportTitle(analysis.dateRange);
    const reportContent = buildDailyReportContent(analysis);

    // 6. 建立 Notion Page
    const pageId = await createNotionPage(
      parentPageId,
      reportTitle,
      reportContent,
      notionApiKey,
    );

    // 7. 記錄成功
    await completeSyncLog(syncLog.id, {
      notionPageId: pageId,
      adsAnalyzed: response.data.length,
      alertsDetected: analysis.alerts.length,
      overallRoas: analysis.summary.overallRoas,
    });

    // 8. 更新排程的執行時間（僅 cron 觸發時更新）
    // 用查到的 schedule.id 而非 caller 傳入的 scheduleId，並把 userId 一併送進去
    // repository 端會用 (id, userId) 雙條件 where，拒絕跨租戶寫入
    if (scheduleId) {
      const schedule = await getSyncSchedule(userId);
      if (schedule && schedule.id === scheduleId) {
        const lastRunAt = new Date();
        const interval = CronExpressionParser.parse(schedule.cronExpression, {
          currentDate: lastRunAt,
          tz: schedule.timezone,
        });
        const nextRunAt = interval.next().toDate();
        await updateScheduleRunTime(schedule.id, userId, lastRunAt, nextRunAt);
      }
    }
  } catch (error) {
    console.error(`使用者 ${userId} 同步失敗:`, error);
    await failSyncLog(
      syncLog.id,
      error instanceof Error ? error.message : String(error),
    );
    // 手動觸發時把錯誤往外丟，讓 API 路由能正確回報失敗
    if (throwOnError) {
      throw error;
    }
  }
}

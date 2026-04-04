import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";
import { createNotionPage } from "@/lib/notion/page-sync";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
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
 */
export async function executeSyncForUser(
  userId: string,
  scheduleId: string,
): Promise<void> {
  console.log(`🔄 開始執行使用者同步任務: ${userId}`);

  // 建立同步記錄
  const syncLog = await createSyncLog(userId);

  try {
    // 1. 取得使用者設定
    const settings = await getUserSettings(userId);

    if (!settings) {
      throw new Error("找不到使用者設定");
    }

    // 檢查是否啟用自動同步
    if (!settings.notionEnabled) {
      console.log(`⏸️  使用者 ${userId} 的自動同步已停用`);
      await failSyncLog(syncLog.id, "自動同步已停用");
      return;
    }

    // 2. 驗證必要設定
    const windsorApiKey = settings.windsorApiKey;
    const notionApiKey = settings.notionApiKey;
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

    console.log(`📊 日期範圍: ${dateRange}`);

    // 3. 取得 Windsor 廣告資料
    console.log("📊 正在取得 Windsor 廣告資料...");
    const query = buildAdPerformanceQuery("all", dateRange);
    const response = await fetchWindsor(windsorApiKey, query);
    console.log(`✅ 成功取得 ${response.data.length} 筆廣告資料`);

    // 4. 執行分析
    console.log("🔍 正在執行分析引擎...");

    // 使用儲存的閾值或預設值
    const thresholds = settings.thresholds
      ? JSON.parse(JSON.stringify(settings.thresholds))
      : DEFAULT_THRESHOLDS;

    const analysis = runFullAnalysis(response.data, thresholds);
    console.log(`✅ 分析完成: ${analysis.alerts.length} 則警示`);

    // 5. 產生報告內容
    const reportTitle = buildReportTitle(analysis.dateRange);
    const reportContent = buildDailyReportContent(analysis);
    console.log(`📝 報告標題: ${reportTitle}`);

    // 6. 建立 Notion Page
    console.log("📤 正在建立 Notion Page...");
    const pageId = await createNotionPage(
      parentPageId,
      reportTitle,
      reportContent,
      notionApiKey,
    );

    console.log(`✅ Notion Page 建立成功: ${pageId}`);

    // 7. 記錄成功
    await completeSyncLog(syncLog.id, {
      notionPageId: pageId,
      adsAnalyzed: response.data.length,
      alertsDetected: analysis.alerts.length,
      overallRoas: analysis.summary.overallRoas,
    });

    // 8. 更新排程的執行時間
    const schedule = await getSyncSchedule(userId);
    if (schedule) {
      const lastRunAt = new Date();
      const interval = CronExpressionParser.parse(schedule.cronExpression, {
        currentDate: lastRunAt,
        tz: schedule.timezone,
      });
      const nextRunAt = interval.next().toDate();
      await updateScheduleRunTime(scheduleId, lastRunAt, nextRunAt);
    }

    console.log(`✅ 使用者 ${userId} 同步完成!`);
  } catch (error) {
    console.error(`❌ 使用者 ${userId} 同步失敗:`, error);
    await failSyncLog(
      syncLog.id,
      error instanceof Error ? error.message : String(error),
    );
  }
}

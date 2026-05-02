import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";
import { createNotionPage } from "@/lib/notion/page-sync";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";

/**
 * 執行每日 Notion 同步
 * 這個函式會被 cron scheduler 呼叫
 * 從資料庫讀取第一位使用者的設定（單租戶向後相容）
 */
export async function syncToNotion(): Promise<void> {
  try {
    // 1. 從資料庫讀取使用者設定
    const settings = await prisma.userSettings.findFirst({
      where: { notionEnabled: true },
    });

    if (!settings) {
      return;
    }

    // 2. 驗證必要設定並解密 API Key
    const windsorApiKey = settings.windsorApiKey
      ? decryptApiKey(settings.windsorApiKey)
      : process.env.WINDSOR_API_KEY;
    const notionApiKey = settings.notionApiKey
      ? decryptApiKey(settings.notionApiKey)
      : null;
    const parentPageId = settings.notionParentPageId;

    if (!windsorApiKey) {
      throw new Error("缺少 Windsor API Key");
    }
    if (!notionApiKey) {
      throw new Error("缺少 Notion API Key（請在 Settings 頁面設定）");
    }
    if (!parentPageId) {
      throw new Error("缺少 Notion Parent Page ID（請在 Settings 頁面設定）");
    }

    // 3. 取得 Windsor 廣告資料
    const query = buildAdPerformanceQuery("all", "last_7d");
    const response = await fetchWindsor(windsorApiKey, query);

    // 4. 執行分析
    const analysis = runFullAnalysis(response.data, DEFAULT_THRESHOLDS);

    // 5. 產生報告內容
    const reportTitle = buildReportTitle(analysis.dateRange);
    const reportContent = buildDailyReportContent(analysis);

    // 6. 建立 Notion Page
    await createNotionPage(
      parentPageId,
      reportTitle,
      reportContent,
      notionApiKey,
    );
  } catch (error) {
    console.error("每日同步失敗:", error);
    // 不要 throw error，避免中斷應用
  }
}

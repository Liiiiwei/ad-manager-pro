import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";
import { createNotionPage } from "@/lib/notion/page-sync";

/**
 * 執行每日 Notion 同步
 * 這個函式會被 cron scheduler 呼叫
 */
export async function syncToNotion(): Promise<void> {
  console.log("🔄 開始執行每日 Notion 同步...");

  try {
    // 1. 從環境變數讀取設定
    const windsorApiKey = process.env.WINDSOR_API_KEY;
    const notionApiKey = process.env.NOTION_API_KEY;
    const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

    if (!windsorApiKey) {
      throw new Error("缺少環境變數: WINDSOR_API_KEY");
    }
    if (!notionApiKey) {
      throw new Error("缺少環境變數: NOTION_API_KEY");
    }
    if (!parentPageId) {
      throw new Error("缺少環境變數: NOTION_PARENT_PAGE_ID");
    }

    // 2. 取得 Windsor 廣告資料
    console.log("📊 正在取得 Windsor 廣告資料...");
    const query = buildAdPerformanceQuery("all", "last_7d");
    const response = await fetchWindsor(windsorApiKey, query);
    console.log(`✅ 成功取得 ${response.data.length} 筆廣告資料`);

    // 3. 執行分析
    console.log("🔍 正在執行分析引擎...");
    const analysis = runFullAnalysis(response.data, DEFAULT_THRESHOLDS);
    console.log(
      `✅ 分析完成: ${analysis.alerts.length} 則警示, ROAS ${analysis.summary.overallRoas.toFixed(2)}x`
    );

    // 4. 產生報告內容
    const reportTitle = buildReportTitle(analysis.dateRange);
    const reportContent = buildDailyReportContent(analysis);
    console.log(`📝 報告標題: ${reportTitle}`);

    // 5. 建立 Notion Page
    console.log("📤 正在建立 Notion Page...");
    const pageId = await createNotionPage(
      parentPageId,
      reportTitle,
      reportContent,
      notionApiKey
    );

    console.log(
      `✅ 每日同步成功! Page ID: ${pageId}, 時間: ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error("❌ 每日同步失敗:", error);
    console.error(
      "錯誤詳情:",
      error instanceof Error ? error.message : String(error)
    );
    // 不要 throw error，避免中斷應用
  }
}

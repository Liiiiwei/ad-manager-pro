import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { syncToNotion } from "@/lib/cron/sync-notion";
import { initCronJobs } from "@/lib/cron/scheduler";

// 在第一次 API 請求時初始化 Cron（singleton pattern）
// 這確保在 Serverless 環境中 Cron 能夠正常運作
initCronJobs();

/**
 * 手動觸發 Notion 同步
 * POST /api/sync-notion
 */
export async function POST() {
  const user = await getCurrentUser();
  try {
    // 檢查必要的環境變數
    if (!process.env.WINDSOR_API_KEY) {
      return NextResponse.json(
        { error: "缺少環境變數: WINDSOR_API_KEY" },
        { status: 500 },
      );
    }
    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json(
        { error: "缺少環境變數: NOTION_API_KEY" },
        { status: 500 },
      );
    }
    if (!process.env.NOTION_PARENT_PAGE_ID) {
      return NextResponse.json(
        { error: "缺少環境變數: NOTION_PARENT_PAGE_ID" },
        { status: 500 },
      );
    }

    // 執行同步
    await syncToNotion();

    return NextResponse.json({
      success: true,
      message: "Notion 同步已完成",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("同步失敗:", error);
    return NextResponse.json(
      {
        error: "同步失敗",
        details:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * 取得同步狀態
 * GET /api/sync-notion
 */
export async function GET() {
  const user = await getCurrentUser();
  const hasWindsorKey = !!process.env.WINDSOR_API_KEY;
  const hasNotionKey = !!process.env.NOTION_API_KEY;
  const hasParentPageId = !!process.env.NOTION_PARENT_PAGE_ID;
  const autoSyncEnabled =
    process.env.ENABLE_AUTO_SYNC?.toLowerCase() !== "false";

  const isConfigured = hasWindsorKey && hasNotionKey && hasParentPageId;

  return NextResponse.json({
    configured: isConfigured,
    autoSync: autoSyncEnabled,
    schedule: process.env.CRON_SCHEDULE || "0 9 * * *",
    missingConfig: {
      windsorApiKey: !hasWindsorKey,
      notionApiKey: !hasNotionKey,
      notionParentPageId: !hasParentPageId,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { executeSyncForUser } from "@/lib/cron/job-executor";
import { initCronJobs } from "@/lib/cron/scheduler";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { getSyncSchedule } from "@/lib/db/repositories/sync-schedule";
import { withRateLimit } from "@/lib/utils/with-rate-limit";

// 在第一次 API 請求時初始化動態 Cron（singleton pattern）
initCronJobs();

/**
 * 手動觸發 Notion 同步（僅同步當前登入使用者的資料）
 * POST /api/sync-notion
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const rateLimited = withRateLimit(
    request,
    { maxRequests: 5, windowMs: 60_000 },
    { identifier: user.id },
  );
  if (rateLimited) return rateLimited;

  // 前置條件：使用者必須先在 Settings 頁面設好 Windsor + Notion 兩組 key
  const settings = await getUserSettings(user.id);
  if (!settings?.windsorApiKey) {
    return NextResponse.json(
      { error: "缺少 Windsor API Key", code: "WINDSOR_KEY_MISSING" },
      { status: 412 },
    );
  }
  if (!settings.notionApiKey) {
    return NextResponse.json(
      { error: "缺少 Notion API Key", code: "NOTION_KEY_MISSING" },
      { status: 412 },
    );
  }
  if (!settings.notionParentPageId) {
    return NextResponse.json(
      { error: "缺少 Notion Parent Page ID", code: "NOTION_PARENT_MISSING" },
      { status: 412 },
    );
  }

  try {
    await executeSyncForUser(user.id);
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
 * 取得當前登入使用者的同步狀態
 * GET /api/sync-notion
 */
export async function GET() {
  const user = await getCurrentUser();
  const settings = await getUserSettings(user.id);
  const schedule = await getSyncSchedule(user.id);

  const hasWindsorKey = !!settings?.windsorApiKey;
  const hasNotionKey = !!settings?.notionApiKey;
  const hasParentPageId = !!settings?.notionParentPageId;
  const isConfigured = hasWindsorKey && hasNotionKey && hasParentPageId;

  return NextResponse.json({
    configured: isConfigured,
    autoSync: schedule?.enabled ?? false,
    schedule: schedule?.cronExpression ?? null,
    nextRunAt: schedule?.nextRunAt ?? null,
    lastRunAt: schedule?.lastRunAt ?? null,
    missingConfig: {
      windsorApiKey: !hasWindsorKey,
      notionApiKey: !hasNotionKey,
      notionParentPageId: !hasParentPageId,
    },
  });
}

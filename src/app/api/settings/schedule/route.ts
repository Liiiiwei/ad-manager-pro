import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import {
  getSyncSchedule,
  upsertSyncSchedule,
} from "@/lib/db/repositories/sync-schedule";

/** POST 請求的 Zod 驗證 schema */
const scheduleSchema = z.object({
  cronExpression: z
    .string()
    .regex(
      /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/,
      "無效的 Cron 表達式",
    ),
  timezone: z.string().max(50).optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/settings/schedule
 * 取得使用者的排程設定
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const schedule = await getSyncSchedule(user.id);

    if (!schedule) {
      return NextResponse.json({
        configured: false,
        cronExpression: "0 9 * * *",
        timezone: "UTC",
        enabled: true,
        lastRunAt: null,
        nextRunAt: null,
      });
    }

    return NextResponse.json({
      configured: true,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
    });
  } catch (error) {
    console.error("讀取排程失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "讀取排程失敗" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/settings/schedule
 * 建立或更新排程設定
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();

    // Zod 驗證
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "請求格式錯誤";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const { cronExpression, timezone, enabled } = parsed.data;

    const schedule = await upsertSyncSchedule(user.id, {
      cronExpression,
      timezone: timezone || "UTC",
      enabled: enabled ?? true,
    });

    return NextResponse.json({
      success: true,
      message: "排程設定已儲存",
      schedule: {
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        nextRunAt: schedule.nextRunAt,
      },
    });
  } catch (error) {
    console.error("儲存排程失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存排程失敗" },
      { status: 500 },
    );
  }
}

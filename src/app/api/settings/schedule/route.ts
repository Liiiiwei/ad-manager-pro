import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/clerk';
import { getSyncSchedule, upsertSyncSchedule } from '@/lib/db/repositories/sync-schedule';

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
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
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
    console.error('讀取排程失敗:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '讀取排程失敗' },
      { status: 500 }
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

    const { cronExpression, timezone, enabled } = body;

    // 驗證 Cron 表達式
    if (!cronExpression || typeof cronExpression !== 'string') {
      return NextResponse.json(
        { error: 'Cron 表達式為必填欄位' },
        { status: 400 }
      );
    }

    const schedule = await upsertSyncSchedule(user.id, {
      cronExpression,
      timezone: timezone || 'UTC',
      enabled: enabled ?? true,
    });

    return NextResponse.json({
      success: true,
      message: '排程設定已儲存',
      schedule: {
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        nextRunAt: schedule.nextRunAt,
      },
    });
  } catch (error) {
    console.error('儲存排程失敗:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '儲存排程失敗' },
      { status: 500 }
    );
  }
}

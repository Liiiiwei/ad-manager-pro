import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/clerk';
import { getUserSettings, updateUserSettings } from '@/lib/db/repositories/user-settings';

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return '***';
  return `${apiKey.slice(0, 7)}***...***${apiKey.slice(-3)}`;
}

/**
 * GET /api/settings
 * 取得當前使用者的所有設定
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const settings = await getUserSettings(user.id);

    if (!settings) {
      return NextResponse.json({
        windsor: { apiKey: null, dateRange: 'last_7d' },
        notion: {
          configured: false,
          apiKey: null,
          parentPageId: null,
          enabled: true,
        },
        thresholds: null,
      });
    }

    return NextResponse.json({
      windsor: {
        apiKey: settings.windsorApiKey ? maskApiKey(settings.windsorApiKey) : null,
        dateRange: settings.windsorDateRange,
      },
      notion: {
        configured: !!(settings.notionApiKey && settings.notionParentPageId),
        apiKey: settings.notionApiKey ? maskApiKey(settings.notionApiKey) : null,
        parentPageId: settings.notionParentPageId,
        enabled: settings.notionEnabled,
      },
      thresholds: settings.thresholds,
    });
  } catch (error) {
    console.error('讀取設定失敗:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '讀取設定失敗' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * 更新使用者設定
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();

    const updateData: any = {};

    // Windsor 設定
    if (body.windsor) {
      if (body.windsor.apiKey) {
        updateData.windsorApiKey = body.windsor.apiKey.trim();
      }
      if (body.windsor.dateRange) {
        updateData.windsorDateRange = body.windsor.dateRange;
      }
    }

    // Notion 設定
    if (body.notion) {
      if (body.notion.apiKey !== undefined) {
        updateData.notionApiKey = body.notion.apiKey?.trim() || null;
      }
      if (body.notion.parentPageId !== undefined) {
        updateData.notionParentPageId = body.notion.parentPageId?.trim() || null;
      }
      if (body.notion.enabled !== undefined) {
        updateData.notionEnabled = body.notion.enabled;
      }
    }

    // 閾值設定
    if (body.thresholds) {
      updateData.thresholds = body.thresholds;
    }

    await updateUserSettings(user.id, updateData);

    return NextResponse.json({
      success: true,
      message: '設定已更新',
    });
  } catch (error) {
    console.error('更新設定失敗:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    );
  }
}

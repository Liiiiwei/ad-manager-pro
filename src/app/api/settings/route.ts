import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/db/repositories/user-settings";
import { maskApiKey } from "@/lib/utils/format";
import { encryptApiKey, decryptApiKey } from "@/lib/utils/crypto";
/** 設定更新資料型別 */
interface SettingsUpdateData {
  windsorApiKey?: string | null;
  windsorDateRange?: string;
  notionApiKey?: string | null;
  notionParentPageId?: string | null;
  notionEnabled?: boolean;
  thresholds?: Record<string, number>;
}

/** PATCH 請求的 Zod 驗證 schema */
const settingsSchema = z
  .object({
    windsor: z
      .object({
        apiKey: z.string().max(500).optional(),
        dateRange: z.string().max(50).optional(),
      })
      .optional(),
    notion: z
      .object({
        apiKey: z.string().max(500).optional(),
        parentPageId: z.string().max(500).optional(),
        enabled: z.boolean().optional(),
      })
      .optional(),
    thresholds: z.record(z.number().finite()).optional(),
    dashboardVisibility: z.record(z.boolean()).optional(),
  })
  .strict();

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
        windsor: { apiKey: null, dateRange: "last_7d" },
        notion: {
          configured: false,
          apiKey: null,
          parentPageId: null,
          enabled: true,
        },
        thresholds: null,
      });
    }

    // 解密後遮罩顯示
    const decryptedWindsorKey = settings.windsorApiKey
      ? decryptApiKey(settings.windsorApiKey)
      : null;
    const decryptedNotionKey = settings.notionApiKey
      ? decryptApiKey(settings.notionApiKey)
      : null;

    return NextResponse.json({
      windsor: {
        apiKey: decryptedWindsorKey ? maskApiKey(decryptedWindsorKey) : null,
        dateRange: settings.windsorDateRange,
      },
      notion: {
        configured: !!(settings.notionApiKey && settings.notionParentPageId),
        apiKey: decryptedNotionKey ? maskApiKey(decryptedNotionKey) : null,
        parentPageId: settings.notionParentPageId,
        enabled: settings.notionEnabled,
      },
      thresholds: settings.thresholds,
    });
  } catch (error) {
    console.error("讀取設定失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "讀取設定失敗" },
      { status: 500 },
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

    // Zod 驗證
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請求格式錯誤", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const updateData: SettingsUpdateData = {};

    // Windsor 設定
    if (data.windsor) {
      if (data.windsor.apiKey) {
        updateData.windsorApiKey = encryptApiKey(data.windsor.apiKey.trim());
      }
      if (data.windsor.dateRange) {
        updateData.windsorDateRange = data.windsor.dateRange;
      }
    }

    // Notion 設定
    if (data.notion) {
      if (data.notion.apiKey !== undefined) {
        updateData.notionApiKey = data.notion.apiKey
          ? encryptApiKey(data.notion.apiKey.trim())
          : null;
      }
      if (data.notion.parentPageId !== undefined) {
        updateData.notionParentPageId =
          data.notion.parentPageId?.trim() || null;
      }
      if (data.notion.enabled !== undefined) {
        updateData.notionEnabled = data.notion.enabled;
      }
    }

    // 閾值設定
    if (data.thresholds) {
      updateData.thresholds = data.thresholds;
    }

    await updateUserSettings(user.id, updateData);

    return NextResponse.json({
      success: true,
      message: "設定已更新",
    });
  } catch (error) {
    console.error("更新設定失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新設定失敗" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/db/repositories/user-settings";
import { maskApiKey } from "@/lib/utils/format";
import { encryptApiKey, decryptApiKey } from "@/lib/utils/crypto";

/** POST 請求的 Zod 驗證 schema */
const notionSettingsSchema = z.object({
  apiKey: z.string().min(1, "Notion API Key 為必填欄位").max(500),
  parentPageId: z.string().min(1, "Notion Parent Page ID 為必填欄位").max(500),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/settings/notion
 * 取得目前的 Notion 設定（遮罩 API Key）
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const settings = await getUserSettings(user.id);

    if (!settings) {
      return NextResponse.json({
        configured: false,
        apiKey: null,
        parentPageId: null,
        enabled: true,
      });
    }

    const decryptedKey = settings.notionApiKey
      ? decryptApiKey(settings.notionApiKey)
      : null;

    return NextResponse.json({
      configured: !!(settings.notionApiKey && settings.notionParentPageId),
      apiKey: decryptedKey ? maskApiKey(decryptedKey) : null,
      parentPageId: settings.notionParentPageId || null,
      enabled: settings.notionEnabled,
    });
  } catch (error) {
    console.error("讀取 Notion 設定失敗:", error);
    return NextResponse.json({ error: "讀取設定失敗" }, { status: 500 });
  }
}

/**
 * POST /api/settings/notion
 * 儲存 Notion 設定
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();

    // Zod 驗證
    const parsed = notionSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "請求格式錯誤";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    const { apiKey, parentPageId, enabled } = parsed.data;

    // 儲存設定到資料庫
    await updateUserSettings(user.id, {
      notionApiKey: encryptApiKey(apiKey.trim()),
      notionParentPageId: parentPageId.trim(),
      notionEnabled: enabled ?? true,
    });

    return NextResponse.json({
      success: true,
      message: "Notion 設定已儲存",
      configured: true,
    });
  } catch (error) {
    console.error("儲存 Notion 設定失敗:", error);
    return NextResponse.json(
      {
        error: "儲存設定失敗",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/settings/notion
 * 清除 Notion 設定
 */
export async function DELETE() {
  try {
    const user = await getCurrentUser();

    await updateUserSettings(user.id, {
      notionApiKey: null,
      notionParentPageId: null,
      notionEnabled: false,
    });

    return NextResponse.json({
      success: true,
      message: "Notion 設定已清除",
    });
  } catch (error) {
    console.error("清除 Notion 設定失敗:", error);
    return NextResponse.json({ error: "清除設定失敗" }, { status: 500 });
  }
}

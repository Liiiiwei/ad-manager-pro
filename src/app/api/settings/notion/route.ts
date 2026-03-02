import { NextRequest, NextResponse } from "next/server";
import {
  loadSettings,
  updateSettings,
  maskApiKey,
  type NotionSettings,
} from "@/lib/settings/storage";

/**
 * GET /api/settings/notion
 * 取得目前的 Notion 設定（遮罩 API Key）
 */
export async function GET() {
  try {
    const settings = loadSettings();
    const notionConfig = settings.notion || {};

    return NextResponse.json({
      configured: !!(notionConfig.apiKey && notionConfig.parentPageId),
      apiKey: notionConfig.apiKey ? maskApiKey(notionConfig.apiKey) : null,
      parentPageId: notionConfig.parentPageId || null,
      enabled: notionConfig.enabled ?? true,
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
    const body = await request.json();
    const { apiKey, parentPageId, enabled } = body as NotionSettings;

    // 驗證必要欄位
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        { error: "Notion API Key 為必填欄位" },
        { status: 400 }
      );
    }

    if (!parentPageId || !parentPageId.trim()) {
      return NextResponse.json(
        { error: "Notion Parent Page ID 為必填欄位" },
        { status: 400 }
      );
    }

    // 儲存設定
    const notionSettings: NotionSettings = {
      apiKey: apiKey.trim(),
      parentPageId: parentPageId.trim(),
      enabled: enabled ?? true,
    };

    updateSettings({ notion: notionSettings });

    console.log("✅ Notion 設定已更新");
    console.log(`   Parent Page ID: ${notionSettings.parentPageId}`);
    console.log(`   啟用狀態: ${notionSettings.enabled}`);

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
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/notion
 * 清除 Notion 設定
 */
export async function DELETE() {
  try {
    updateSettings({
      notion: {
        apiKey: undefined,
        parentPageId: undefined,
        enabled: false,
      },
    });

    console.log("🗑️  Notion 設定已清除");

    return NextResponse.json({
      success: true,
      message: "Notion 設定已清除",
    });
  } catch (error) {
    console.error("清除 Notion 設定失敗:", error);
    return NextResponse.json({ error: "清除設定失敗" }, { status: 500 });
  }
}

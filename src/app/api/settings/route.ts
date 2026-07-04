import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/clerk";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/db/repositories/user-settings";
import { maskApiKey } from "@/lib/utils/format";
import { encryptApiKey, decryptApiKey } from "@/lib/utils/crypto";
import { mergeThresholds, thresholdsSchema } from "@/lib/analysis/thresholds";
import {
  accountBudgetsSchema,
  mergeAccountBudgets,
} from "@/lib/settings/account-budgets";

/** 設定更新資料型別 */
interface SettingsUpdateData {
  windsorApiKey?: string | null;
  windsorDateRange?: string;
  notionApiKey?: string | null;
  notionParentPageId?: string | null;
  notionEnabled?: boolean;
  thresholds?: Prisma.InputJsonValue;
  accountBudgets?: Prisma.InputJsonValue;
  lineChannelToken?: string | null;
  lineRecipientId?: string | null;
  linePushEnabled?: boolean;
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
    line: z
      .object({
        channelToken: z.string().max(500).optional(),
        recipientId: z.string().max(100).optional(),
        enabled: z.boolean().optional(),
      })
      .optional(),
    thresholds: thresholdsSchema.optional(),
    accountBudgets: accountBudgetsSchema.optional(),
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
        line: { hasLineToken: false, recipientId: null, enabled: false },
        thresholds: mergeThresholds(null),
        accountBudgets: {},
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
      // 只回是否已設定的布林，絕不回傳 token 值（含遮罩值）
      line: {
        hasLineToken: !!settings.lineChannelToken,
        recipientId: settings.lineRecipientId,
        enabled: settings.linePushEnabled,
      },
      // 與 default 合併，前端不會因 DB 殘留舊版欄位而拿到不完整結構
      thresholds: mergeThresholds(settings.thresholds),
      accountBudgets: settings.accountBudgets ?? {},
    });
  } catch (error) {
    console.error("讀取設定失敗:", error);
    return NextResponse.json(
      {
        error: "讀取設定失敗",
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

    // LINE 推播設定（token 加密比照 windsorApiKey；GET 絕不回傳 token 值）
    if (data.line) {
      if (data.line.channelToken !== undefined) {
        updateData.lineChannelToken = data.line.channelToken
          ? encryptApiKey(data.line.channelToken.trim())
          : null;
      }
      if (data.line.recipientId !== undefined) {
        updateData.lineRecipientId = data.line.recipientId?.trim() || null;
      }
      if (data.line.enabled !== undefined) {
        updateData.linePushEnabled = data.line.enabled;
      }
    }

    // 閾值設定：用 mergeThresholds 補齊缺欄位，避免 DB 寫入部分結構
    if (data.thresholds) {
      updateData.thresholds = mergeThresholds(
        data.thresholds,
      ) as unknown as Prisma.InputJsonValue;
    }

    // 帳號手動月預算：merge 語意（只動送來的 key；null 刪除該 key）
    if (data.accountBudgets) {
      const existing = await getUserSettings(user.id);
      updateData.accountBudgets = mergeAccountBudgets(
        existing?.accountBudgets,
        data.accountBudgets,
      ) as Prisma.InputJsonValue;
    }

    await updateUserSettings(user.id, updateData);

    return NextResponse.json({
      success: true,
      message: "設定已更新",
    });
  } catch (error) {
    console.error("更新設定失敗:", error);
    return NextResponse.json(
      {
        error: "更新設定失敗",
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

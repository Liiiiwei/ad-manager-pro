import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { withRateLimit } from "@/lib/utils/with-rate-limit";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { decryptApiKey } from "@/lib/utils/crypto";
import { pushFlex, pushText } from "@/lib/line/client";
import { buildTestFlex } from "@/lib/line/flex";
import { getAppUrl } from "@/lib/cron/monitor-jobs";

/**
 * POST /api/line/test
 * 用「已儲存」的 LINE 憑證發送測試訊息（無請求參數，不讀 body）
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // 速率限制：每分鐘 5 次（以使用者為單位，防止拿此端點騷擾 LINE API）
    const limited = withRateLimit(
      request,
      { maxRequests: 5, windowMs: 60_000 },
      { identifier: user.id },
    );
    if (limited) return limited;

    const settings = await getUserSettings(user.id);
    if (!settings?.lineChannelToken || !settings?.lineRecipientId) {
      return NextResponse.json(
        { error: "尚未設定 LINE Channel Token 或接收者 ID，請先儲存設定" },
        { status: 412 },
      );
    }

    const channelToken = decryptApiKey(settings.lineChannelToken);
    const appUrl = getAppUrl();

    // 先推 Flex；失敗（例如 Flex 被拒）退純文字再試一次
    let result = await pushFlex(
      channelToken,
      settings.lineRecipientId,
      buildTestFlex(appUrl),
      "Ad Manager Pro 測試訊息",
    );
    if (!result.ok) {
      result = await pushText(
        channelToken,
        settings.lineRecipientId,
        `Ad Manager Pro 測試訊息：LINE 推播設定成功！\n${appUrl}/daily`,
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "LINE 推播失敗，請檢查 Channel Token 與接收者 ID",
          status: result.status,
          details: result.error,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "測試訊息已送出，請查看 LINE",
    });
  } catch (error) {
    console.error("LINE 測試推播失敗:", error);
    return NextResponse.json(
      {
        error: "LINE 測試推播失敗",
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

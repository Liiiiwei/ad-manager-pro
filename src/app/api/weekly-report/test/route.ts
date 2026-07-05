import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { withRateLimit } from "@/lib/utils/with-rate-limit";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { runWeeklyReportForUser } from "@/lib/cron/weekly-jobs";

/**
 * POST /api/weekly-report/test
 * 用「已儲存」的 LINE 憑證，對「自己」發送一次週報（不跑全體、不管 weeklyReportEnabled 開關）。
 * 仿 /api/line/test：登入態 + 速率限制。
 *
 * dev 注入基準日：非 production 時可帶 ?date=YYYY-MM-DD 覆寫「今天」，
 * 方便重播任意週（窗口全由 now 推導）；production 忽略此參數。
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

    // dev 基準日注入（production 一律用現在時間）
    let now = new Date();
    if (process.env.NODE_ENV !== "production") {
      const dateParam = request.nextUrl.searchParams.get("date");
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        now = new Date(`${dateParam}T09:00:00+08:00`);
      }
    }

    await runWeeklyReportForUser(settings, now);

    return NextResponse.json({
      success: true,
      message: "週報已送出，請查看 LINE",
    });
  } catch (error) {
    console.error("週報測試推播失敗:", error);
    return NextResponse.json(
      {
        error: "週報測試推播失敗",
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

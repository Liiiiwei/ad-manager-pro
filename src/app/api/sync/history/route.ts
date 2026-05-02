import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { getSyncHistory } from "@/lib/db/repositories/sync-log";

/**
 * GET /api/sync/history
 * 取得使用者的同步歷史記錄
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const history = await getSyncHistory(user.id, 20);

    return NextResponse.json({
      history: history.map((log) => ({
        id: log.id,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
        status: log.status,
        notionPageId: log.notionPageId,
        adsAnalyzed: log.adsAnalyzed,
        alertsDetected: log.alertsDetected,
        overallRoas: log.overallRoas,
        errorMessage: log.errorMessage,
      })),
    });
  } catch (error) {
    console.error("讀取同步歷史失敗:", error);
    return NextResponse.json(
      {
        error: "讀取同步歷史失敗",
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

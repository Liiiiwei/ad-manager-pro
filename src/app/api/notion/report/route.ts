import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";
import { withRateLimit } from "@/lib/utils/with-rate-limit";

export async function POST(request: NextRequest) {
  const rateLimited = withRateLimit(request, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const user = await getCurrentUser();

  // 從資料庫讀取 Windsor API Key
  const settings = await prisma.userSettings.findFirst({
    where: { userId: user.id },
  });
  if (!settings?.windsorApiKey) {
    return NextResponse.json(
      { error: "請先在設定頁面設定 Windsor API Key" },
      { status: 400 },
    );
  }
  const apiKey = decryptApiKey(settings.windsorApiKey);

  try {
    const body = await request.json();
    const dateRange = body.dateRange || "last_7d";

    // 取得資料並分析
    const query = buildAdPerformanceQuery("all", dateRange);
    const response = await fetchWindsor(apiKey, query);
    const analysis = runFullAnalysis(response.data);

    // 組裝報告內容
    const title = buildReportTitle(analysis.dateRange);
    const content = buildDailyReportContent(analysis);

    // 回傳報告內容（前端透過 Notion MCP 建立頁面）
    return NextResponse.json({
      title,
      content,
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "報告產生失敗",
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

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
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
  const apiKey = request.headers.get("x-windsor-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 Windsor API Key" },
      { status: 401 },
    );
  }

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

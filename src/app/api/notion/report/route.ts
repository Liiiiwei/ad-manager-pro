import { NextRequest, NextResponse } from "next/server";
import { requireWindsorApiKey } from "@/lib/auth/require-windsor-key";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { buildDailyReportContent, buildReportTitle } from "@/lib/notion/report";

export async function POST(request: NextRequest) {
  const gate = await requireWindsorApiKey(request, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (gate instanceof NextResponse) return gate;
  const { apiKey } = gate;

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

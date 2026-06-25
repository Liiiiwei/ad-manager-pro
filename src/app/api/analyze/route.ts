import { NextRequest, NextResponse } from "next/server";
import { requireWindsorApiKey } from "@/lib/auth/require-windsor-key";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS, mergeThresholds } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";

export async function GET(request: NextRequest) {
  const gate = await requireWindsorApiKey(request, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (gate instanceof NextResponse) return gate;
  const { apiKey } = gate;

  const { searchParams } = request.nextUrl;
  const dateRange = searchParams.get("dateRange") || "last_7d";
  const thresholdsParam = searchParams.get("thresholds");

  let thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS;
  if (thresholdsParam) {
    // 限制原始字串長度，防止過大 payload
    if (thresholdsParam.length > 2000) {
      return NextResponse.json(
        { error: "thresholds 參數過長" },
        { status: 400 },
      );
    }
    try {
      // 與 /api/settings 共用 mergeThresholds：strict + finite + nonnegative
      // 驗證失敗或部分覆寫都會回傳完整 AnalysisThresholds 結構
      thresholds = mergeThresholds(JSON.parse(thresholdsParam));
    } catch {
      // JSON 解析失敗，使用預設值
    }
  }

  try {
    // 取得所有平台的資料
    const query = buildAdPerformanceQuery("all", dateRange);
    const response = await fetchWindsor(apiKey, query);

    // 執行分析
    const result = runFullAnalysis(response.data, thresholds);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "分析失敗",
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

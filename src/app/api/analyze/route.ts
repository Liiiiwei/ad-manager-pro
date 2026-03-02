import { NextRequest, NextResponse } from "next/server";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-windsor-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 Windsor API Key" },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const dateRange = searchParams.get("dateRange") || "last_7d";
  const thresholdsParam = searchParams.get("thresholds");

  let thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS;
  if (thresholdsParam) {
    try {
      thresholds = { ...DEFAULT_THRESHOLDS, ...JSON.parse(thresholdsParam) };
    } catch {
      // 使用預設值
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
    const message = error instanceof Error ? error.message : "分析失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { runFullAnalysis } from "@/lib/analysis/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";
import { withRateLimit } from "@/lib/utils/with-rate-limit";

// 閾值參數的 Zod 驗證 schema（防止 prototype pollution）
const thresholdsSchema = z
  .object({
    lowROAS: z.number().finite().nonnegative().optional(),
    highCPC: z.number().finite().nonnegative().optional(),
    lowCTR: z.number().finite().nonnegative().optional(),
    highCPM: z.number().finite().nonnegative().optional(),
    minImpressions: z.number().finite().nonnegative().optional(),
    minClicks: z.number().finite().nonnegative().optional(),
    minSpend: z.number().finite().nonnegative().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
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
      const parsed = thresholdsSchema.safeParse(JSON.parse(thresholdsParam));
      if (parsed.success) {
        thresholds = { ...DEFAULT_THRESHOLDS, ...parsed.data };
      }
      // 驗證失敗時使用預設值
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

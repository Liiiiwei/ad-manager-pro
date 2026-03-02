import { NextRequest, NextResponse } from "next/server";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery, buildDailyTrendQuery } from "@/lib/windsor/queries";
import type { WindsorQueryParams } from "@/lib/windsor/types";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-windsor-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 Windsor API Key" },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const connector = (searchParams.get("connector") || "all") as WindsorQueryParams["connector"];
  const dateRange = searchParams.get("dateRange") || "last_7d";
  const level = searchParams.get("level") || "campaign";

  try {
    let query: WindsorQueryParams;

    if (level === "trend") {
      query = buildDailyTrendQuery(connector, dateRange);
    } else {
      query = buildAdPerformanceQuery(connector, dateRange);
    }

    const data = await fetchWindsor(apiKey, query);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireWindsorApiKey } from "@/lib/auth/require-windsor-key";
import { fetchWindsor } from "@/lib/windsor/client";
import {
  buildAdPerformanceQuery,
  buildDailyTrendQuery,
} from "@/lib/windsor/queries";
import type { WindsorQueryParams } from "@/lib/windsor/types";

const VALID_CONNECTORS = ["facebook", "google_ads", "all"] as const;

export async function GET(request: NextRequest) {
  const gate = await requireWindsorApiKey(request, {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (gate instanceof NextResponse) return gate;
  const { apiKey } = gate;

  const { searchParams } = request.nextUrl;
  const connector = (searchParams.get("connector") ||
    "all") as WindsorQueryParams["connector"];

  // 驗證 connector 白名單
  if (!VALID_CONNECTORS.includes(connector)) {
    return NextResponse.json({ error: "無效的 connector" }, { status: 400 });
  }
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
    return NextResponse.json(
      {
        error: "未知錯誤",
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

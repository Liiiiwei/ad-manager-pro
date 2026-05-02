import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { testApiKey } from "@/lib/windsor/client";
import { withRateLimit } from "@/lib/utils/with-rate-limit";

export async function POST(request: NextRequest) {
  const rateLimited = withRateLimit(request, {
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const user = await getCurrentUser();
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { valid: false, error: "請提供 API Key" },
        { status: 400 },
      );
    }

    const valid = await testApiKey(apiKey);
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json(
      { valid: false, error: "連線測試失敗" },
      { status: 500 },
    );
  }
}

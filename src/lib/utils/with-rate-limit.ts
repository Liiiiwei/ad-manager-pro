import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "./rate-limit";

// 從 request 取得使用者識別（IP 或 x-forwarded-for）
function getIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

export function withRateLimit(
  request: Request,
  config?: RateLimitConfig,
): NextResponse | null {
  const id = getIdentifier(request);
  const result = checkRateLimit(id, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "請求過於頻繁，請稍後再試" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((result.resetTime - Date.now()) / 1000),
          ),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null; // 允許通過
}

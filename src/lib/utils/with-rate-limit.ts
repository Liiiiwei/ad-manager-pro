import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "./rate-limit";

/**
 * 取得速率限制 identifier
 * - 已認證路由應傳入 `opts.identifier = user.id`（避免 NAT 後共用 IP 互相 DoS）
 * - 未認證入口才退回 IP；優先用 `x-real-ip`（Zeabur 設定），其次取 XFF 最後一段（最接近平台 proxy）
 */
function getIdentifier(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const segments = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // 最後一段是最接近平台 proxy 的來源，前面的可由 client 偽造
    const last = segments[segments.length - 1];
    if (last) return `ip:${last}`;
  }
  return "ip:unknown";
}

export interface WithRateLimitOpts {
  /** 已認證路由請傳入 user.id（會以 `user:{id}` 作 bucket） */
  identifier?: string;
}

export function withRateLimit(
  request: Request,
  config?: RateLimitConfig,
  opts?: WithRateLimitOpts,
): NextResponse | null {
  const id = opts?.identifier
    ? `user:${opts.identifier}`
    : getIdentifier(request);
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
  return null;
}

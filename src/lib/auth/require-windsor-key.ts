import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { decryptApiKey } from "@/lib/utils/crypto";
import { withRateLimit } from "@/lib/utils/with-rate-limit";
import type { RateLimitConfig } from "@/lib/utils/rate-limit";

/**
 * 認證 + 速率限制 + 載入 Windsor API Key 的單一入口
 *
 * 用法：
 *   const gate = await requireWindsorApiKey(request, { maxRequests: 30, windowMs: 60_000 });
 *   if (gate instanceof NextResponse) return gate; // 401 / 412 / 429
 *   const { user, apiKey } = gate;
 *
 * 統一回應：
 * - 401（未登入時 getCurrentUser 已 throw，呼叫端可包 try/catch；本 helper 不處理）
 * - 412 + `code: "WINDSOR_KEY_MISSING"` 當未設定 key
 * - 429 由 withRateLimit 回
 */
export async function requireWindsorApiKey(
  request: Request,
  rateLimit?: RateLimitConfig,
): Promise<
  | { user: Awaited<ReturnType<typeof getCurrentUser>>; apiKey: string }
  | NextResponse
> {
  const user = await getCurrentUser();

  // 認證後才掛速率限制，bucket 以 user.id 區隔（避免 NAT 後共用 IP 互相 DoS）
  const rateLimited = withRateLimit(request, rateLimit, {
    identifier: user.id,
  });
  if (rateLimited) return rateLimited;

  const settings = await getUserSettings(user.id);
  if (!settings?.windsorApiKey) {
    return NextResponse.json(
      {
        error: "請先在設定頁面設定 Windsor API Key",
        code: "WINDSOR_KEY_MISSING",
      },
      { status: 412 },
    );
  }

  const apiKey = decryptApiKey(settings.windsorApiKey);
  return { user, apiKey };
}

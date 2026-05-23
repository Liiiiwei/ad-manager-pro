// 簡易滑動視窗速率限制器（記憶體內）
// 注意：多實例部署時需改用 Redis

const MAX_ENTRIES = 10_000; // 上限：避免偽造 IP 攻擊把記憶體灌爆

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// 用 globalThis 守護 setInterval，避免 Next.js HMR / 多次 import 累積 timer
const TIMER_KEY = Symbol.for("ad-manager-pro.rate-limit.cleanup");
type GlobalWithTimer = typeof globalThis & {
  [TIMER_KEY]?: NodeJS.Timeout;
};
const globalRef = globalThis as GlobalWithTimer;

if (!globalRef[TIMER_KEY]) {
  globalRef[TIMER_KEY] = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap) {
      if (now > value.resetTime) rateLimitMap.delete(key);
    }
  }, 60_000);
  // Node.js：unref 讓此 timer 不阻擋 process exit（測試環境必要）
  globalRef[TIMER_KEY]?.unref?.();
}

export interface RateLimitConfig {
  maxRequests: number; // 視窗內最大請求數
  windowMs: number; // 視窗毫秒數
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 },
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    // 達上限時惰性丟掉最舊的過期條目；仍滿則拒絕（fail-closed 防灌爆）
    if (rateLimitMap.size >= MAX_ENTRIES) {
      for (const [key, value] of rateLimitMap) {
        if (now > value.resetTime) {
          rateLimitMap.delete(key);
          if (rateLimitMap.size < MAX_ENTRIES) break;
        }
      }
      if (rateLimitMap.size >= MAX_ENTRIES) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + config.windowMs,
        };
      }
    }
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    };
  }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  return {
    allowed: entry.count <= config.maxRequests,
    remaining,
    resetTime: entry.resetTime,
  };
}

/**
 * 測試專用：清空所有 rate limit 狀態
 */
export function _resetRateLimitForTest(): void {
  rateLimitMap.clear();
}

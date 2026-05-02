// 簡易滑動視窗速率限制器（記憶體內）
// 注意：多實例部署時需改用 Redis

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// 每 60 秒清理過期條目
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetTime) rateLimitMap.delete(key);
  }
}, 60_000);

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

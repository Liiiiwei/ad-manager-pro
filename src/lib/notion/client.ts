import { Client, isNotionClientError, APIErrorCode } from "@notionhq/client";

/**
 * 建立 Notion Client（database 同步管線共用入口）。
 * 注意：apiKey 必須是「已解密」的明文金鑰——解密（decryptApiKey）由呼叫端負責，
 * 比照 monitor-jobs resolveCredentials 的慣例。
 */
export function createNotionClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

/** 呼叫間最小間隔（毫秒）。Notion 平均限額 3 req/s，保守取 350ms。 */
const MIN_INTERVAL_MS = 350;

/** 5xx 重試前的固定等待（毫秒） */
const SERVER_ERROR_RETRY_DELAY_MS = 1000;

/** 429 未帶 Retry-After 時的預設等待（毫秒） */
const DEFAULT_RATE_LIMIT_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 全域串行鏈：所有經過 withNotionThrottle 的呼叫依序執行，彼此間隔 ≥ MIN_INTERVAL_MS */
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** 從錯誤物件取 Retry-After（秒），headers 可能是 Headers 物件或純物件 */
function retryAfterMs(error: unknown): number {
  const headers = (error as { headers?: unknown }).headers;
  let raw: string | null | undefined;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    const record = headers as Record<string, string | undefined>;
    raw = record["retry-after"] ?? record["Retry-After"];
  }
  const seconds = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RATE_LIMIT_DELAY_MS;
  }
  return seconds * 1000;
}

/** 錯誤分類：決定要不要重試一次 */
function classifyError(
  error: unknown,
): "rate_limited" | "server_error" | "other" {
  if (isNotionClientError(error)) {
    if (error.code === APIErrorCode.RateLimited) return "rate_limited";
    if (
      error.code === APIErrorCode.InternalServerError ||
      error.code === APIErrorCode.ServiceUnavailable
    ) {
      return "server_error";
    }
  }
  // 非 SDK 已知錯誤但帶 HTTP status 的（如 UnknownHTTPResponseError）
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server_error";
  }
  return "other";
}

/**
 * Notion API 節流 wrapper：
 * - 全域串行（同 process 內所有呼叫排隊），呼叫間隔 ≥ 350ms
 * - 429 → 依 Retry-After 等待後重試一次
 * - 5xx → 等 1 秒後重試一次
 * - 重試仍失敗或其他錯誤 → 原樣拋出，由呼叫端決定子任務失敗語意
 */
export function withNotionThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const attempt = async (): Promise<T> => {
      const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return fn();
    };

    try {
      return await attempt();
    } catch (error) {
      const kind = classifyError(error);
      if (kind === "rate_limited") {
        await sleep(retryAfterMs(error));
        return attempt();
      }
      if (kind === "server_error") {
        await sleep(SERVER_ERROR_RETRY_DELAY_MS);
        return attempt();
      }
      throw error;
    }
  });
  // 鏈上吞掉錯誤，避免一次失敗讓後續所有呼叫連鎖 reject
  queue = run.catch(() => undefined);
  return run;
}

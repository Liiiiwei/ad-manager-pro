import { windsorResponseSchema, normalizeRecord, type WindsorQueryParams, type WindsorResponse } from "./types";

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";

export class WindsorApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Windsor API error (${status}): ${body}`);
    this.name = "WindsorApiError";
  }
}

/** 呼叫 Windsor.ai API */
export async function fetchWindsor(
  apiKey: string,
  params: WindsorQueryParams,
): Promise<WindsorResponse> {
  const url = new URL(`${WINDSOR_BASE_URL}/${params.connector}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("fields", params.fields.join(","));

  if (params.date_preset) {
    url.searchParams.set("date_preset", params.date_preset);
  }
  if (params.date_from) {
    url.searchParams.set("date_from", params.date_from);
  }
  if (params.date_to) {
    url.searchParams.set("date_to", params.date_to);
  }
  if (params.date_aggregation) {
    url.searchParams.set("date_aggregation", params.date_aggregation);
  }
  if (params.filter) {
    url.searchParams.set("filter", params.filter);
  }
  if (params._max_rows) {
    url.searchParams.set("_max_rows", String(params._max_rows));
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.text();
    throw new WindsorApiError(res.status, body);
  }

  const json = await res.json();
  const parsed = windsorResponseSchema.parse(json);

  // 正規化每筆資料：將 Meta 特有欄位轉為統一格式
  return {
    data: parsed.data.map(normalizeRecord),
    meta: parsed.meta,
  };
}

/** 測試 API Key 是否有效 */
export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const url = `${WINDSOR_BASE_URL}/list_connectors?api_key=${apiKey}`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

/** 格式化貨幣 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 格式化數字（含千分位） */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** 格式化百分比 */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 格式化 ROAS */
export function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`;
}

/** 格式化 CTR（百分比形式） */
export function formatCtr(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 遮罩 API Key（用於前端顯示） */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "***";
  return `${apiKey.slice(0, 7)}***...***${apiKey.slice(-3)}`;
}

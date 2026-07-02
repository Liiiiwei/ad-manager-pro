/**
 * 靜態手動匯率表：1 單位外幣 = N 新台幣（TWD）。
 *
 * 匯率為手動維護的近似值，需定期更新（參考日：2026-07）。
 * 廣告帳戶多為 TWD，僅少數外幣帳戶需換算。
 * 未列出的幣別視為 1（不做換算），避免因缺表而讓數字爆掉。
 */
const RATES_TO_TWD: Record<string, number> = {
  TWD: 1,
  HKD: 4.1,
  USD: 32,
  EUR: 34,
  GBP: 40,
  JPY: 0.21,
  CNY: 4.4,
  SGD: 24,
  AUD: 21,
  KRW: 0.024,
};

/** 取得某幣別對 TWD 的匯率；未知或缺值回退為 1 */
export function rateToTwd(currency: string | null | undefined): number {
  if (!currency) return 1;
  const rate = RATES_TO_TWD[currency.toUpperCase()];
  return rate ?? 1;
}

/** 將某幣別金額換算為 TWD */
export function toTwd(amount: number, currency: string): number {
  return amount * rateToTwd(currency);
}

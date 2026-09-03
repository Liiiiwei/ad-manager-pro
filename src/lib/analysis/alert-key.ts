import type { Alert } from "./types";

// 用 U+001F（單元分隔符）串接欄位：名稱內幾乎不可能出現此控制字元，避免跨欄位碰撞
//（例如活動名 "A" 與廣告組名 "A" 錯位時不會產生同一把鍵）。
// 與 schema.prisma 既有複合鍵慣例一致。用 String.fromCharCode 產生，避免原始碼夾帶隱形字元而脆弱。
const SEP = String.fromCharCode(0x1f);

/**
 * 由警示的「內容穩定欄位」產生辨識鍵。
 * 刻意排除隨機 id、severity、detectedAt——這些會隨每次重算變動，
 * 導致「已處理」標記記不住。只用結構性欄位，讓同一個問題跨重算得到同一把鍵。
 */
export function alertStableKey(
  alert: Pick<
    Alert,
    | "category"
    | "metric"
    | "accountName"
    | "campaignName"
    | "adsetName"
    | "adName"
  >,
): string {
  return [
    alert.category,
    alert.metric,
    alert.accountName ?? "",
    alert.campaignName ?? "",
    alert.adsetName ?? "",
    alert.adName ?? "",
  ].join(SEP);
}

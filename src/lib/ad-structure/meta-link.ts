/**
 * 建構 Meta Ads Manager 深連結
 * 用於廣告架構圖節點卡片上的「開啟後台」按鈕，讓使用者直接跳轉到
 * 該廣告組合／廣告素材在 Ads Manager 上的位置進行編輯。
 */

/** 缺任一必要 ID 時代表無法組出有效連結 */
export interface MetaLinkIds {
  accountId?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
}

/** 去除 account_id 的 act_ 前綴，Ads Manager 網址的 act= 只吃數字部分 */
function stripAccountPrefix(accountId: string): string {
  return accountId.replace(/^act_/, "");
}

/** 建構「廣告組合」層級的 Ads Manager 連結；缺任一必要 ID 回傳 null */
export function buildAdsetLink(ids: MetaLinkIds): string | null {
  const { accountId, campaignId, adsetId } = ids;
  if (!accountId || !campaignId || !adsetId) return null;
  const act = stripAccountPrefix(accountId);
  return `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${act}&selected_campaign_ids=${campaignId}&selected_adset_ids=${adsetId}`;
}

/** 建構「廣告素材」層級的 Ads Manager 連結；缺任一必要 ID 回傳 null */
export function buildAdLink(ids: MetaLinkIds): string | null {
  const { accountId, campaignId, adsetId, adId } = ids;
  if (!accountId || !campaignId || !adsetId || !adId) return null;
  const act = stripAccountPrefix(accountId);
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act}&selected_campaign_ids=${campaignId}&selected_adset_ids=${adsetId}&selected_ad_ids=${adId}`;
}

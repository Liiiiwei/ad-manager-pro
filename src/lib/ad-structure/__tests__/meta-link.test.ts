import { describe, it, expect } from "vitest";
import { buildAdsetLink, buildAdLink } from "../meta-link";

describe("buildAdsetLink", () => {
  it("回傳正確的廣告組合層級連結", () => {
    const url = buildAdsetLink({
      accountId: "123456789",
      campaignId: "111",
      adsetId: "222",
    });
    expect(url).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/adsets?act=123456789&selected_campaign_ids=111&selected_adset_ids=222",
    );
  });

  it("account_id 帶 act_ 前綴時會被去除", () => {
    const url = buildAdsetLink({
      accountId: "act_123456789",
      campaignId: "111",
      adsetId: "222",
    });
    expect(url).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/adsets?act=123456789&selected_campaign_ids=111&selected_adset_ids=222",
    );
  });

  it("缺少必要 ID 時回傳 null", () => {
    expect(
      buildAdsetLink({ accountId: "123", campaignId: "111", adsetId: null }),
    ).toBeNull();
    expect(
      buildAdsetLink({ accountId: "", campaignId: "111", adsetId: "222" }),
    ).toBeNull();
    expect(buildAdsetLink({})).toBeNull();
  });
});

describe("buildAdLink", () => {
  it("回傳正確的廣告素材層級連結", () => {
    const url = buildAdLink({
      accountId: "123456789",
      campaignId: "111",
      adsetId: "222",
      adId: "333",
    });
    expect(url).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/ads?act=123456789&selected_campaign_ids=111&selected_adset_ids=222&selected_ad_ids=333",
    );
  });

  it("account_id 帶 act_ 前綴時會被去除", () => {
    const url = buildAdLink({
      accountId: "act_987654321",
      campaignId: "111",
      adsetId: "222",
      adId: "333",
    });
    expect(url).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/ads?act=987654321&selected_campaign_ids=111&selected_adset_ids=222&selected_ad_ids=333",
    );
  });

  it("缺少必要 ID（adId）時回傳 null", () => {
    expect(
      buildAdLink({
        accountId: "123",
        campaignId: "111",
        adsetId: "222",
        adId: undefined,
      }),
    ).toBeNull();
  });

  it("缺少必要 ID（accountId）時回傳 null", () => {
    expect(
      buildAdLink({
        accountId: null,
        campaignId: "111",
        adsetId: "222",
        adId: "333",
      }),
    ).toBeNull();
  });
});

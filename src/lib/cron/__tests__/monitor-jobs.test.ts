import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserSettings } from "@prisma/client";
import type { WindsorAdRecord } from "@/lib/windsor/types";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userSettings: { findMany: vi.fn() },
    alertRule: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/windsor/client", () => ({
  fetchWindsor: vi.fn(),
}));
vi.mock("@/lib/line/client", () => ({
  pushFlex: vi.fn(),
  pushText: vi.fn(),
}));
vi.mock("@/lib/alerts/dedupe", () => ({
  saveNewAlertNotifications: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { fetchWindsor } from "@/lib/windsor/client";
import { pushFlex, pushText } from "@/lib/line/client";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";
import {
  getAppUrl,
  runDailyDigestForAllUsers,
  runAnomalyCheckForAllUsers,
} from "../monitor-jobs";

const settingsFindMany = vi.mocked(prisma.userSettings.findMany);
const ruleFindMany = vi.mocked(prisma.alertRule.findMany);
const fetchWindsorMock = vi.mocked(fetchWindsor);
const pushFlexMock = vi.mocked(pushFlex);
const pushTextMock = vi.mocked(pushText);
const saveMock = vi.mocked(saveNewAlertNotifications);

/** 產生完整 UserSettings 測試列 */
function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: "settings-1",
    userId: "user-1",
    windsorApiKey: "windsor-key",
    notionApiKey: null,
    notionParentPageId: null,
    notionEnabled: true,
    windsorDateRange: "last_7d",
    thresholds: null,
    accountBudgets: null,
    lineChannelToken: "line-token",
    lineRecipientId: "U123",
    linePushEnabled: true,
    weeklyReportEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** 產生完整 28 欄位的 Windsor 測試記錄 */
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2026-07-03",
    source: "meta",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset: "測試廣告組",
    ad_name: "測試廣告",
    spend: 100,
    impressions: 10000,
    clicks: 200,
    conversions: 10,
    revenue: 500,
    frequency: 1.5,
    cpc: 0.5,
    cpm: 10,
    ctr: 2.0,
    roas: 5.0,
    purchases: 10,
    addToCart: 20,
    initiateCheckout: 15,
    leads: 5,
    purchaseValue: 500,
    addToCartValue: 300,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

/** 觸發 spend > 100 的規則列（結構與 prisma AlertRule 相容） */
const TRIGGER_RULE = {
  id: "rule-1",
  userId: "user-1",
  name: "花費監控",
  metric: "spend",
  condition: "gt",
  threshold: 100,
  platform: "all",
  campaignFilter: null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOW = new Date("2026-07-04T08:30:00+08:00");

beforeEach(() => {
  settingsFindMany.mockReset();
  ruleFindMany.mockReset();
  fetchWindsorMock.mockReset();
  pushFlexMock.mockReset();
  pushTextMock.mockReset();
  saveMock.mockReset();

  ruleFindMany.mockResolvedValue([] as never);
  fetchWindsorMock.mockResolvedValue({ data: [makeRecord()] } as never);
  pushFlexMock.mockResolvedValue({ ok: true, status: 200 });
  pushTextMock.mockResolvedValue({ ok: true, status: 200 });
  saveMock.mockResolvedValue({ newAlerts: [], notifications: [] });
});

describe("getAppUrl", () => {
  it("未設 NEXT_PUBLIC_APP_URL 時回 localhost", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("runDailyDigestForAllUsers", () => {
  it("缺 LINE token 的使用者跳過，不推播", async () => {
    settingsFindMany.mockResolvedValue([
      makeSettings({ lineChannelToken: null }),
    ] as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).not.toHaveBeenCalled();
    expect(pushTextMock).not.toHaveBeenCalled();
  });

  it("正常使用者收到 Flex 摘要推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    const [token, to, bubble, altText] = pushFlexMock.mock.calls[0];
    expect(token).toBe("line-token"); // dev 環境 decrypt 回原文
    expect(to).toBe("U123");
    expect((bubble as { type: string }).type).toBe("bubble");
    expect(altText).toContain("2026-07-03");
  });

  it("第一位使用者 Windsor 失敗，第二位仍收到推播（錯誤隔離）", async () => {
    settingsFindMany.mockResolvedValue([
      makeSettings({ userId: "user-1" }),
      makeSettings({
        id: "settings-2",
        userId: "user-2",
        lineRecipientId: "U456",
      }),
    ] as never);
    fetchWindsorMock
      .mockRejectedValueOnce(new Error("Windsor 掛了"))
      .mockResolvedValueOnce({ data: [makeRecord()] } as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    expect(pushFlexMock.mock.calls[0][1]).toBe("U456");
  });

  it("LINE 推播失敗（ok:false）不 throw", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    pushFlexMock.mockResolvedValue({ ok: false, status: 429, error: "limit" });

    await expect(runDailyDigestForAllUsers(NOW)).resolves.toBeUndefined();
  });
});

describe("runAnomalyCheckForAllUsers", () => {
  it("無啟用規則：不抓 Windsor、不推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([] as never);

    await runAnomalyCheckForAllUsers(NOW);

    expect(fetchWindsorMock).not.toHaveBeenCalled();
    expect(pushFlexMock).not.toHaveBeenCalled();
  });

  it("newAlerts 為空（今日已通知過）：寫入去重後不推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([TRIGGER_RULE] as never);
    // 最新日 spend 200 > 閾值 100 → checkRules 會觸發
    fetchWindsorMock.mockResolvedValue({
      data: [
        makeRecord({ date: "2026-07-02", spend: 50 }),
        makeRecord({ date: "2026-07-03", spend: 200 }),
      ],
    } as never);
    saveMock.mockResolvedValue({ newAlerts: [], notifications: [] });

    await runAnomalyCheckForAllUsers(NOW);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(pushFlexMock).not.toHaveBeenCalled();
  });

  it("有新寫入異常：先寫 DB 再推 Flex", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([TRIGGER_RULE] as never);
    fetchWindsorMock.mockResolvedValue({
      data: [
        makeRecord({ date: "2026-07-02", spend: 50 }),
        makeRecord({ date: "2026-07-03", spend: 200 }),
      ],
    } as never);
    saveMock.mockImplementation(async (_userId, alerts) => ({
      newAlerts: alerts,
      notifications: [],
    }));

    await runAnomalyCheckForAllUsers(NOW);

    expect(saveMock).toHaveBeenCalledTimes(1);
    // saveNewAlertNotifications 收到 checkRules 的觸發結果
    expect(saveMock.mock.calls[0][1].length).toBeGreaterThan(0);
    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    const altText = pushFlexMock.mock.calls[0][3];
    expect(altText).toContain("件");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock 全部下游依賴（純單元測試，不打 DB / 外部 API）
vi.mock("@/lib/db/repositories/sync-log", () => ({
  createSyncLog: vi.fn(),
  completeSyncLog: vi.fn(),
  failSyncLog: vi.fn(),
}));

vi.mock("@/lib/db/repositories/user-settings", () => ({
  getUserSettings: vi.fn(),
}));

vi.mock("@/lib/db/repositories/sync-schedule", () => ({
  getSyncSchedule: vi.fn(),
  updateScheduleRunTime: vi.fn(),
}));

vi.mock("@/lib/utils/crypto", () => ({
  decryptApiKey: vi.fn((s: string) => s.replace(/^enc-/, "")),
}));

vi.mock("@/lib/windsor/client", () => ({
  fetchWindsor: vi.fn(),
}));

vi.mock("@/lib/notion/page-sync", () => ({
  createNotionPage: vi.fn(),
}));

import { executeSyncForUser } from "../job-executor";
import {
  createSyncLog,
  failSyncLog,
  completeSyncLog,
} from "@/lib/db/repositories/sync-log";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { fetchWindsor } from "@/lib/windsor/client";
import { createNotionPage } from "@/lib/notion/page-sync";

function settings(
  overrides: Partial<{
    windsorApiKey: string | null;
    notionApiKey: string | null;
    notionParentPageId: string | null;
    notionEnabled: boolean;
    windsorDateRange: string;
    thresholds: unknown;
  }> = {},
) {
  return {
    id: "settings-1",
    userId: "user-1",
    windsorApiKey: "enc-windsor-key",
    notionApiKey: "enc-notion-key",
    notionParentPageId: "parent-page-id",
    notionEnabled: true,
    windsorDateRange: "last_7d",
    thresholds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof getUserSettings>>;
}

describe("executeSyncForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSyncLog).mockResolvedValue({ id: "log-1" } as never);
    vi.mocked(completeSyncLog).mockResolvedValue({} as never);
    vi.mocked(failSyncLog).mockResolvedValue({} as never);
  });

  it("找不到 settings 時 → failSyncLog", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(null);

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("找不到使用者設定"),
    );
    expect(fetchWindsor).not.toHaveBeenCalled();
  });

  it("notionEnabled=false 時 → failSyncLog 並 early return", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      settings({ notionEnabled: false }),
    );

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("自動同步已停用"),
    );
    expect(fetchWindsor).not.toHaveBeenCalled();
  });

  it("缺 Windsor API Key 時 → failSyncLog", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      settings({ windsorApiKey: null }),
    );

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("缺少 Windsor API Key"),
    );
    expect(fetchWindsor).not.toHaveBeenCalled();
  });

  it("缺 Notion API Key 時 → failSyncLog", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      settings({ notionApiKey: null }),
    );

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("缺少 Notion API Key"),
    );
  });

  it("缺 Notion Parent Page ID 時 → failSyncLog", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      settings({ notionParentPageId: null }),
    );

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("缺少 Notion Parent Page ID"),
    );
  });

  it("全套設定齊備 + fetch/create 成功 → completeSyncLog with 統計", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockResolvedValue({
      data: [
        {
          ad_id: "a1",
          ad_name: "Ad 1",
          campaign_name: "C1",
          adset_name: "AS1",
          account_name: "Acc1",
          source: "facebook",
          date: "2026-05-20",
          spend: 100,
          impressions: 1000,
          clicks: 50,
          conversions: 5,
          revenue: 500,
          ctr: 5,
          cpc: 2,
          cpm: 100,
          roas: 5,
        },
      ],
    } as never);
    vi.mocked(createNotionPage).mockResolvedValue("notion-page-id");

    await executeSyncForUser("user-1");

    expect(failSyncLog).not.toHaveBeenCalled();
    expect(completeSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({
        notionPageId: "notion-page-id",
        adsAnalyzed: 1,
      }),
    );
  });

  it("Windsor 抓取失敗 → failSyncLog 帶 error message", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockRejectedValue(new Error("Windsor 503"));

    await executeSyncForUser("user-1");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("Windsor 503"),
    );
    expect(completeSyncLog).not.toHaveBeenCalled();
  });

  it("throwOnError=true（手動觸發）失敗時 → 寫 failSyncLog 後 re-throw", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockRejectedValue(new Error("Windsor 503"));

    await expect(
      executeSyncForUser("user-1", undefined, { throwOnError: true }),
    ).rejects.toThrow("Windsor 503");

    expect(failSyncLog).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("Windsor 503"),
    );
  });

  it("throwOnError 預設 false（cron 觸發）失敗時 → 只寫 failSyncLog 不丟出", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockRejectedValue(new Error("Windsor 503"));

    // 不應 reject
    await expect(executeSyncForUser("user-1")).resolves.toBeUndefined();
    expect(failSyncLog).toHaveBeenCalled();
  });

  it("不傳 scheduleId（手動觸發）→ 不查也不寫 schedule 表", async () => {
    const { getSyncSchedule, updateScheduleRunTime } =
      await import("@/lib/db/repositories/sync-schedule");
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockResolvedValue({ data: [] } as never);
    vi.mocked(createNotionPage).mockResolvedValue("page-x");

    await executeSyncForUser("user-1"); // 不帶 scheduleId

    expect(getSyncSchedule).not.toHaveBeenCalled();
    expect(updateScheduleRunTime).not.toHaveBeenCalled();
  });

  it("scheduleId 與該 user 的 schedule.id 不匹配 → 不寫 schedule 表（防跨租戶）", async () => {
    vi.doMock("cron-parser", () => ({
      CronExpressionParser: {
        parse: () => ({ next: () => ({ toDate: () => new Date() }) }),
      },
    }));
    const { getSyncSchedule, updateScheduleRunTime } =
      await import("@/lib/db/repositories/sync-schedule");
    vi.mocked(getUserSettings).mockResolvedValue(settings());
    vi.mocked(fetchWindsor).mockResolvedValue({ data: [] } as never);
    vi.mocked(createNotionPage).mockResolvedValue("page-y");
    // user-1 自己的 schedule 是 sched-A，但 caller 傳了 sched-B
    vi.mocked(getSyncSchedule).mockResolvedValue({
      id: "sched-A",
      userId: "user-1",
      cronExpression: "0 0 * * *",
      timezone: "UTC",
      enabled: true,
      lastRunAt: null,
      nextRunAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await executeSyncForUser("user-1", "sched-B");

    expect(updateScheduleRunTime).not.toHaveBeenCalled();
  });
});

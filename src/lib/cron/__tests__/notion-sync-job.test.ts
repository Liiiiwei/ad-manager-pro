import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserSettings } from "@prisma/client";
import type { NotionDatabaseIds } from "@/lib/notion/databases";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userSettings: { findMany: vi.fn() },
    syncLog: { update: vi.fn() },
    budgetChangeLog: { updateMany: vi.fn() },
    budgetActionItem: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/repositories/sync-log", () => ({
  createSyncLog: vi.fn(),
  failSyncLog: vi.fn(),
}));
vi.mock("@/lib/db/repositories/user-settings", () => ({
  updateUserSettings: vi.fn(),
}));
// dev 慣例：decrypt 直接回原文
vi.mock("@/lib/utils/crypto", () => ({
  decryptApiKey: vi.fn((s: string) => s),
}));
vi.mock("@/lib/windsor/client", () => ({
  fetchWindsor: vi.fn(),
}));
vi.mock("@/lib/notion/client", () => ({
  createNotionClient: vi.fn(() => ({ fake: "notion-client" })),
  withNotionThrottle: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/notion/databases", () => ({
  ensureNotionDatabases: vi.fn(),
}));
vi.mock("@/lib/notion/daily-rows", () => ({
  buildDailyPerformanceRows: vi.fn(() => []),
  upsertDailyRows: vi.fn(),
}));
vi.mock("@/lib/notion/changelog-sync", () => ({
  pushChangeLogsToNotion: vi.fn(),
}));
vi.mock("@/lib/notion/action-item-sync", () => ({
  pullResolvedFromNotion: vi.fn(),
  pushActionItemsToNotion: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { createSyncLog, failSyncLog } from "@/lib/db/repositories/sync-log";
import { updateUserSettings } from "@/lib/db/repositories/user-settings";
import { fetchWindsor } from "@/lib/windsor/client";
import { ensureNotionDatabases } from "@/lib/notion/databases";
import { upsertDailyRows } from "@/lib/notion/daily-rows";
import { pushChangeLogsToNotion } from "@/lib/notion/changelog-sync";
import {
  pullResolvedFromNotion,
  pushActionItemsToNotion,
} from "@/lib/notion/action-item-sync";
import {
  runNotionDatabaseSyncForUser,
  runNotionDatabaseSyncForAllUsers,
} from "../notion-sync-job";

const settingsFindMany = vi.mocked(prisma.userSettings.findMany);
const syncLogUpdate = vi.mocked(prisma.syncLog.update);
const changeLogUpdateMany = vi.mocked(prisma.budgetChangeLog.updateMany);
const actionItemUpdateMany = vi.mocked(prisma.budgetActionItem.updateMany);
const createSyncLogMock = vi.mocked(createSyncLog);
const failSyncLogMock = vi.mocked(failSyncLog);
const updateUserSettingsMock = vi.mocked(updateUserSettings);
const fetchWindsorMock = vi.mocked(fetchWindsor);
const ensureMock = vi.mocked(ensureNotionDatabases);
const upsertDailyRowsMock = vi.mocked(upsertDailyRows);
const pushChangeLogsMock = vi.mocked(pushChangeLogsToNotion);
const pullResolvedMock = vi.mocked(pullResolvedFromNotion);
const pushActionItemsMock = vi.mocked(pushActionItemsToNotion);

const NOW = new Date("2026-07-03T12:10:00+08:00");

const IDS: NotionDatabaseIds = {
  version: 1,
  daily: { databaseId: "d1", dataSourceId: "ds1" },
  changelog: { databaseId: "d2", dataSourceId: "ds2" },
  todo: { databaseId: "d3", dataSourceId: "ds3" },
};

/** 產生完整 UserSettings 測試列（notion 欄位有值） */
function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: "settings-1",
    userId: "user-1",
    windsorApiKey: "windsor-key",
    notionApiKey: "notion-key",
    notionParentPageId: "parent-page-1",
    notionEnabled: true,
    windsorDateRange: "last_7d",
    thresholds: null,
    accountBudgets: null,
    lineChannelToken: "line-token",
    lineRecipientId: "U123",
    linePushEnabled: true,
    weeklyReportEnabled: false,
    notionDatabases: IDS as never,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createSyncLogMock.mockResolvedValue({ id: "log-1" } as never);
  failSyncLogMock.mockResolvedValue({} as never);
  syncLogUpdate.mockResolvedValue({} as never);
  ensureMock.mockResolvedValue({ ids: IDS, changed: false, rebuilt: [] });
  fetchWindsorMock.mockResolvedValue({ data: [] } as never);
  upsertDailyRowsMock.mockResolvedValue({ created: 3, updated: 7 });
  pushChangeLogsMock.mockResolvedValue(2);
  pullResolvedMock.mockResolvedValue(1);
  pushActionItemsMock.mockResolvedValue({ created: 1, updated: 1 });
});

describe("runNotionDatabaseSyncForUser", () => {
  it("三子任務全成功 → SUCCESS，errorMessage 為三段摘要", async () => {
    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(createSyncLogMock).toHaveBeenCalledWith("user-1", "notion_db_sync");
    expect(syncLogUpdate).toHaveBeenCalledTimes(1);
    const arg = syncLogUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "log-1" });
    expect(arg.data).toMatchObject({
      status: "SUCCESS",
      errorMessage:
        "每日成效: ok(建3更新7)｜操作日誌: ok(新增2)｜待辦: ok(讀回1推送2)",
    });
  });

  it("未啟用或缺 Notion 憑證 → 直接跳過，不建 SyncLog", async () => {
    await runNotionDatabaseSyncForUser(
      makeSettings({ notionEnabled: false }),
      NOW,
    );
    await runNotionDatabaseSyncForUser(
      makeSettings({ notionApiKey: null }),
      NOW,
    );
    await runNotionDatabaseSyncForUser(
      makeSettings({ notionParentPageId: null }),
      NOW,
    );

    expect(createSyncLogMock).not.toHaveBeenCalled();
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("ensureNotionDatabases 失敗 → failSyncLog，子任務全不跑", async () => {
    ensureMock.mockRejectedValue(new Error("parent page 不存在"));

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(failSyncLogMock).toHaveBeenCalledWith(
      "log-1",
      expect.stringContaining("Notion database 檢查/建立失敗"),
    );
    expect(upsertDailyRowsMock).not.toHaveBeenCalled();
    expect(pushChangeLogsMock).not.toHaveBeenCalled();
    expect(pullResolvedMock).not.toHaveBeenCalled();
    expect(syncLogUpdate).not.toHaveBeenCalled();
  });

  it("changed → 回寫 notionDatabases；rebuilt → 清空對應表 notionPageId", async () => {
    ensureMock.mockResolvedValue({
      ids: IDS,
      changed: true,
      rebuilt: ["changelog", "todo"],
    });
    changeLogUpdateMany.mockResolvedValue({ count: 5 } as never);
    actionItemUpdateMany.mockResolvedValue({ count: 3 } as never);

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(updateUserSettingsMock).toHaveBeenCalledWith("user-1", {
      notionDatabases: IDS,
    });
    expect(changeLogUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { notionPageId: null },
    });
    expect(actionItemUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { notionPageId: null },
    });
  });

  it("一個子任務失敗 → PARTIAL，其餘子任務照跑", async () => {
    pushChangeLogsMock.mockRejectedValue(new Error("Notion 500"));

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(upsertDailyRowsMock).toHaveBeenCalledTimes(1);
    expect(pullResolvedMock).toHaveBeenCalledTimes(1);
    expect(pushActionItemsMock).toHaveBeenCalledTimes(1);
    const arg = syncLogUpdate.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "PARTIAL" });
    expect(arg.data.errorMessage).toContain("操作日誌: 失敗(Notion 500)");
    expect(arg.data.errorMessage).toContain("每日成效: ok(建3更新7)");
  });

  it("三子任務全失敗 → FAILED", async () => {
    fetchWindsorMock.mockRejectedValue(new Error("Windsor 掛了"));
    pushChangeLogsMock.mockRejectedValue(new Error("boom"));
    pullResolvedMock.mockRejectedValue(new Error("boom"));

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(syncLogUpdate.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
    });
  });

  it("讀回失敗 → 不推送待辦（避免蓋掉使用者剛勾的項目），待辦記失敗", async () => {
    pullResolvedMock.mockRejectedValue(new Error("query 失敗"));

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(pushActionItemsMock).not.toHaveBeenCalled();
    const arg = syncLogUpdate.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "PARTIAL" });
    expect(arg.data.errorMessage).toContain("待辦: 失敗(query 失敗)");
  });

  it("缺 Windsor 憑證 → 每日成效失敗，操作日誌/待辦照跑 → PARTIAL", async () => {
    await runNotionDatabaseSyncForUser(
      makeSettings({ windsorApiKey: null }),
      NOW,
    );

    expect(fetchWindsorMock).not.toHaveBeenCalled();
    expect(pushChangeLogsMock).toHaveBeenCalledTimes(1);
    expect(pushActionItemsMock).toHaveBeenCalledTimes(1);
    const arg = syncLogUpdate.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "PARTIAL" });
    expect(arg.data.errorMessage).toContain("每日成效: 失敗(缺 Windsor 憑證)");
  });

  it("待辦讀回在推送之前執行（先讀回再推送）", async () => {
    const order: string[] = [];
    pullResolvedMock.mockImplementation(async () => {
      order.push("pull");
      return 0;
    });
    pushActionItemsMock.mockImplementation(async () => {
      order.push("push");
      return { created: 0, updated: 0 };
    });

    await runNotionDatabaseSyncForUser(makeSettings(), NOW);

    expect(order).toEqual(["pull", "push"]);
  });
});

describe("runNotionDatabaseSyncForAllUsers", () => {
  it("只撈 notionEnabled 且憑證齊全的使用者", async () => {
    settingsFindMany.mockResolvedValue([] as never);

    await runNotionDatabaseSyncForAllUsers(NOW);

    expect(settingsFindMany).toHaveBeenCalledWith({
      where: {
        notionEnabled: true,
        notionApiKey: { not: null },
        notionParentPageId: { not: null },
      },
    });
  });

  it("第一位使用者失敗，第二位照常同步（錯誤隔離）", async () => {
    settingsFindMany.mockResolvedValue([
      makeSettings({ userId: "user-1" }),
      makeSettings({ id: "settings-2", userId: "user-2" }),
    ] as never);
    // user-1 建 SyncLog 就炸（模擬 DB 錯誤，繞過函式內全部 try/catch）
    createSyncLogMock
      .mockRejectedValueOnce(new Error("DB 掛了"))
      .mockResolvedValueOnce({ id: "log-2" } as never);

    await expect(
      runNotionDatabaseSyncForAllUsers(NOW),
    ).resolves.toBeUndefined();

    // user-2 仍完成整輪（收尾 update 用 log-2）
    expect(syncLogUpdate).toHaveBeenCalledTimes(1);
    expect(syncLogUpdate.mock.calls[0][0].where).toEqual({ id: "log-2" });
  });
});

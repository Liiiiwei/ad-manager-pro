import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@notionhq/client";
import type { BudgetChangeLog } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetChangeLog: { findMany: vi.fn(), update: vi.fn() },
  },
}));
// 節流層直接透傳
vi.mock("@/lib/notion/client", () => ({
  withNotionThrottle: (fn: () => unknown) => fn(),
  createNotionClient: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { pushChangeLogsToNotion } from "../changelog-sync";

const findManyMock = vi.mocked(prisma.budgetChangeLog.findMany);
const updateMock = vi.mocked(prisma.budgetChangeLog.update);

/** 產生完整 BudgetChangeLog 測試列 */
function makeLog(overrides: Partial<BudgetChangeLog> = {}): BudgetChangeLog {
  return {
    id: "log-1",
    userId: "user-1",
    source: "auto",
    scope: "campaign",
    platform: "meta",
    entityKey: "camp-1",
    entityLabel: "測試活動",
    budgetType: "daily",
    previousValue: 1000,
    newValue: 1500,
    changePercent: 50,
    note: null,
    notionPageId: null,
    detectedAt: new Date("2026-07-02T12:00:00+08:00"),
    ...overrides,
  } as BudgetChangeLog;
}

function makeNotion() {
  const create = vi.fn();
  const update = vi.fn();
  const notion = {
    dataSources: { query: vi.fn() },
    pages: { create, update },
  } as unknown as Client;
  return { notion, create, update };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pushChangeLogsToNotion", () => {
  it("只撈 notionPageId 為 null 的紀錄（app 側去重錨點）", async () => {
    const { notion } = makeNotion();
    findManyMock.mockResolvedValue([] as never);

    const created = await pushChangeLogsToNotion(notion, "ds-cl", "user-1");

    expect(created).toBe(0);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1", notionPageId: null },
      orderBy: { detectedAt: "asc" },
    });
  });

  it("兩筆未推送：各建一頁並回寫 notionPageId；永不呼叫 pages.update", async () => {
    const { notion, create, update } = makeNotion();
    findManyMock.mockResolvedValue([
      makeLog({ id: "log-1" }),
      makeLog({ id: "log-2" }),
    ] as never);
    create
      .mockResolvedValueOnce({ id: "page-1" })
      .mockResolvedValueOnce({ id: "page-2" });
    updateMock.mockResolvedValue({} as never);

    const created = await pushChangeLogsToNotion(notion, "ds-cl", "user-1");

    expect(created).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].parent).toEqual({
      type: "data_source_id",
      data_source_id: "ds-cl",
    });
    // 只 create、永不 update（投手手動補的欄位不被覆寫）
    expect(update).not.toHaveBeenCalled();
    // 成功一筆立刻回寫一筆
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "log-1" },
      data: { notionPageId: "page-1" },
    });
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "log-2" },
      data: { notionPageId: "page-2" },
    });
  });

  it("單筆建頁失敗：成功筆已回寫，結尾拋錯（下輪只重推失敗筆）", async () => {
    const { notion, create } = makeNotion();
    findManyMock.mockResolvedValue([
      makeLog({ id: "log-1" }),
      makeLog({ id: "log-2" }),
    ] as never);
    create
      .mockRejectedValueOnce(new Error("Notion 429"))
      .mockResolvedValueOnce({ id: "page-2" });
    updateMock.mockResolvedValue({} as never);

    await expect(
      pushChangeLogsToNotion(notion, "ds-cl", "user-1"),
    ).rejects.toThrow("1/2 筆建立失敗");

    // 失敗筆不回寫（notionPageId 維持 null，下輪重推）；成功筆已回寫
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "log-2" },
      data: { notionPageId: "page-2" },
    });
  });
});

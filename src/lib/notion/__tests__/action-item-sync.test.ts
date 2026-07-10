import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@notionhq/client";
import type { BudgetActionItem } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetActionItem: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
// 節流層直接透傳
vi.mock("@/lib/notion/client", () => ({
  withNotionThrottle: (fn: () => unknown) => fn(),
  createNotionClient: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { PROP } from "../database-schemas";
import {
  pullResolvedFromNotion,
  pushActionItemsToNotion,
} from "../action-item-sync";

const findManyMock = vi.mocked(prisma.budgetActionItem.findMany);
const updateMock = vi.mocked(prisma.budgetActionItem.update);
const updateManyMock = vi.mocked(prisma.budgetActionItem.updateMany);

const NOW = new Date("2026-07-03T12:10:00+08:00");

/** 產生完整 BudgetActionItem 測試列 */
function makeItem(overrides: Partial<BudgetActionItem> = {}): BudgetActionItem {
  return {
    id: "item-1",
    userId: "user-1",
    reason: "pacing_overspend",
    platform: "meta",
    accountName: "帳戶A",
    severity: "warning",
    detail: "配速 130%",
    status: "open",
    resolvedBy: null,
    linkedChangeLogId: null,
    notionPageId: null,
    createdAt: new Date("2026-07-01T12:00:00+08:00"),
    resolvedAt: null,
    ...overrides,
  } as BudgetActionItem;
}

function makeNotion() {
  const query = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const notion = {
    dataSources: { query },
    pages: { create, update },
  } as unknown as Client;
  return { notion, query, create, update };
}

/** dataSources.query 單頁回應：已勾完成的 row（系統ID = app 端 id） */
function checkedPage(
  systemIds: string[],
  hasMore = false,
  cursor: string | null = null,
) {
  return {
    results: systemIds.map((id, i) => ({
      id: `page-${i}`,
      properties: {
        [PROP.todo.systemId]: { rich_text: [{ plain_text: id }] },
      },
    })),
    has_more: hasMore,
    next_cursor: cursor,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pullResolvedFromNotion", () => {
  it("Notion 已勾完成 × app 端仍 open → 標 resolved（resolvedBy=notion_checkbox）", async () => {
    const { notion, query } = makeNotion();
    query.mockResolvedValue(checkedPage(["item-1", "item-2"]));
    updateManyMock.mockResolvedValue({ count: 2 } as never);

    const pulled = await pullResolvedFromNotion(notion, "ds-todo", "user-1");

    expect(pulled).toBe(2);
    // 查詢用「完成」checkbox filter
    expect(query.mock.calls[0][0].filter).toEqual({
      property: PROP.todo.done,
      checkbox: { equals: true },
    });
    // status: "open" 條件 → app 已終態者不重複改（冪等）；userId 拒絕跨租戶
    const arg = updateManyMock.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: { in: ["item-1", "item-2"] },
      userId: "user-1",
      status: "open",
    });
    expect(arg.data).toMatchObject({
      status: "resolved",
      resolvedBy: "notion_checkbox",
    });
    expect(arg.data.resolvedAt).toBeInstanceOf(Date);
  });

  it("分頁：has_more 時跟進 next_cursor，彙整全部系統ID", async () => {
    const { notion, query } = makeNotion();
    query
      .mockResolvedValueOnce(checkedPage(["item-1"], true, "cur-2"))
      .mockResolvedValueOnce(checkedPage(["item-2"]));
    updateManyMock.mockResolvedValue({ count: 1 } as never);

    await pullResolvedFromNotion(notion, "ds-todo", "user-1");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].start_cursor).toBe("cur-2");
    expect(updateManyMock.mock.calls[0][0].where?.id).toEqual({
      in: ["item-1", "item-2"],
    });
  });

  it("Notion 無已勾項目：回 0 且不打 DB", async () => {
    const { notion, query } = makeNotion();
    query.mockResolvedValue(checkedPage([]));

    const pulled = await pullResolvedFromNotion(notion, "ds-todo", "user-1");

    expect(pulled).toBe(0);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});

describe("pushActionItemsToNotion", () => {
  it("open 且未推送 → create 並回寫 notionPageId", async () => {
    const { notion, create, update } = makeNotion();
    findManyMock.mockResolvedValue([makeItem()] as never);
    create.mockResolvedValue({ id: "page-new" });
    updateMock.mockResolvedValue({} as never);

    const result = await pushActionItemsToNotion(
      notion,
      "ds-todo",
      "user-1",
      NOW,
    );

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(create.mock.calls[0][0].parent).toEqual({
      type: "data_source_id",
      data_source_id: "ds-todo",
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { notionPageId: "page-new" },
    });
  });

  it("open 且已推送 → update 鏡射（不重建頁）", async () => {
    const { notion, create, update } = makeNotion();
    findManyMock.mockResolvedValue([
      makeItem({ notionPageId: "page-1" }),
    ] as never);
    update.mockResolvedValue({ id: "page-1" });

    const result = await pushActionItemsToNotion(
      notion,
      "ds-todo",
      "user-1",
      NOW,
    );

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].page_id).toBe("page-1");
    // 「完成」checkbox 鏡射 open → false
    expect(update.mock.calls[0][0].properties[PROP.todo.done]).toEqual({
      checkbox: false,
    });
  });

  it("7 天內 resolved 且已推送 → update 且完成 checkbox 為 true", async () => {
    const { notion, update } = makeNotion();
    findManyMock.mockResolvedValue([
      makeItem({
        status: "resolved",
        notionPageId: "page-1",
        resolvedAt: new Date("2026-07-02T09:00:00+08:00"),
        resolvedBy: "auto_recovered",
      }),
    ] as never);
    update.mockResolvedValue({ id: "page-1" });

    const result = await pushActionItemsToNotion(
      notion,
      "ds-todo",
      "user-1",
      NOW,
    );

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(update.mock.calls[0][0].properties[PROP.todo.done]).toEqual({
      checkbox: true,
    });
    // 7 天鏡射窗寫進查詢條件（terminal 分支帶 gte windowStart）
    const where = findManyMock.mock.calls[0][0]!.where!;
    const terminalBranch = (where.OR as Array<Record<string, unknown>>)[1] as {
      OR: Array<{ resolvedAt?: { gte?: Date } }>;
    };
    expect(terminalBranch.OR[0].resolvedAt?.gte).toEqual(
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
    );
  });

  it("終態且從未推送 → 跳過（不補建歷史待辦）", async () => {
    const { notion, create, update } = makeNotion();
    findManyMock.mockResolvedValue([
      makeItem({ status: "resolved", notionPageId: null }),
    ] as never);

    const result = await pushActionItemsToNotion(
      notion,
      "ds-todo",
      "user-1",
      NOW,
    );

    expect(result).toEqual({ created: 0, updated: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("單筆失敗：其餘照推，結尾拋錯", async () => {
    const { notion, create } = makeNotion();
    findManyMock.mockResolvedValue([
      makeItem({ id: "item-1" }),
      makeItem({ id: "item-2" }),
    ] as never);
    create
      .mockRejectedValueOnce(new Error("Notion 500"))
      .mockResolvedValueOnce({ id: "page-2" });
    updateMock.mockResolvedValue({} as never);

    await expect(
      pushActionItemsToNotion(notion, "ds-todo", "user-1", NOW),
    ).rejects.toThrow("1/2 筆推送失敗");
    expect(create).toHaveBeenCalledTimes(2);
    // 成功筆已回寫
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { notionPageId: "page-2" },
    });
  });
});

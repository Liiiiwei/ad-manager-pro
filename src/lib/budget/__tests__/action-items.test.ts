import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetActionItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { syncPacingActionItems } from "../action-items";
import type { PacingViolation } from "../pacing";
import type { AccountSummary } from "@/lib/initiatives/types";

const findMany = vi.mocked(prisma.budgetActionItem.findMany);
const create = vi.mocked(prisma.budgetActionItem.create);
const update = vi.mocked(prisma.budgetActionItem.update);
const count = vi.mocked(prisma.budgetActionItem.count);

function violation(overrides: Partial<PacingViolation> = {}): PacingViolation {
  return {
    accountName: "魔幻主義",
    platform: "Meta",
    severity: "warning",
    monthSpend: 12000,
    periodBudget: 10000,
    pacingRatio: 1.2,
    monthlyBudget: 30000,
    ...overrides,
  };
}

/** 產生觀測到的帳號摘要（預設：手動月預算、配速已回正） */
function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    accountName: "魔幻主義",
    platform: "Meta",
    spend: 9000,
    periodBudget: 10000,
    hasBudget: true,
    progress: 0.9,
    budgetSource: "manual",
    monthlyBudget: 30000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(1);
});

describe("syncPacingActionItems", () => {
  it("帳號無既有 open 待辦時建立新待辦", async () => {
    findMany.mockResolvedValue([]);
    await syncPacingActionItems("u1", [violation()]);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      reason: "pacing_overspend",
      accountName: "魔幻主義",
      severity: "warning",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("帳號已有 open 待辦時更新不新增（去重）", async () => {
    findMany.mockResolvedValue([
      { id: "item1", accountName: "魔幻主義" } as never,
    ]);
    await syncPacingActionItems("u1", [violation({ severity: "critical" })]);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "item1" },
      data: { severity: "critical" },
    });
  });

  it("多帳號各自處理：新帳號建立、既有帳號更新", async () => {
    findMany.mockResolvedValue([
      { id: "item-a", accountName: "A 帳號" } as never,
    ]);
    await syncPacingActionItems("u1", [
      violation({ accountName: "A 帳號", severity: "critical" }),
      violation({ accountName: "B 帳號", severity: "warning" }),
    ]);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "item-a" },
      data: { severity: "critical" },
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({
      accountName: "B 帳號",
      severity: "warning",
    });
  });

  it("回傳同步後 open 待辦筆數", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(3);
    const result = await syncPacingActionItems("u1", [violation()]);
    expect(result).toBe(3);
  });
});

describe("syncPacingActionItems 回正自動結案", () => {
  const openItem = {
    id: "item1",
    accountName: "魔幻主義",
    detail: { pacingRatio: 1.2, monthSpend: 12000 },
  } as never;

  it("配速回正（< warning 門檻）→ 標 resolved 並記錄回正 ratio", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems("u1", [], [account({ progress: 0.9 })]);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "item1" },
      data: {
        status: "resolved",
        resolvedBy: "pacing_recovered",
        detail: {
          pacingRatio: 1.2, // 既有 detail 保留
          resolvedReason: "pacing_recovered",
          recoveredRatio: 0.9,
        },
      },
    });
    expect(
      (update.mock.calls[0][0].data as { resolvedAt: Date }).resolvedAt,
    ).toBeInstanceOf(Date);
  });

  it("本次數據抓不到該帳號 → 不動它", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems(
      "u1",
      [],
      [account({ accountName: "別的帳號" })],
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("手動月預算被移除（不再是 manual）→ 也結案，理由記 manual_budget_removed", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems(
      "u1",
      [],
      [
        account({
          budgetSource: "api",
          monthlyBudget: undefined,
          progress: 1.3,
        }),
      ],
    );
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "item1" },
      data: {
        status: "resolved",
        resolvedBy: "pacing_recovered",
        detail: {
          resolvedReason: "manual_budget_removed",
          recoveredRatio: null,
        },
      },
    });
  });

  it("仍在超支名單中的帳號只更新待辦，不會被結案", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems(
      "u1",
      [violation({ pacingRatio: 1.3, severity: "critical" })],
      [account({ progress: 1.3 })],
    );
    // 只有超支 upsert 的 update，沒有 resolved 的 update
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0].data).toMatchObject({
      severity: "critical",
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("配速恰等於門檻（1.1）→ 保守維持 open 不結案", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems("u1", [], [account({ progress: 1.1 })]);
    expect(update).not.toHaveBeenCalled();
  });

  it("未帶入觀測帳號時維持舊行為，不做回正結案", async () => {
    findMany.mockResolvedValue([openItem]);
    await syncPacingActionItems("u1", []);
    expect(update).not.toHaveBeenCalled();
  });
});

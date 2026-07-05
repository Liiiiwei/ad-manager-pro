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

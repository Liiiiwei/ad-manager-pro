import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
    budgetChangeLog: { create: vi.fn() },
    budgetActionItem: { updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { syncCampaignSnapshots, type CampaignBudget } from "../snapshot";

const snapFindMany = vi.mocked(prisma.budgetSnapshot.findMany);
const snapUpsert = vi.mocked(prisma.budgetSnapshot.upsert);
const logCreate = vi.mocked(prisma.budgetChangeLog.create);
const itemUpdateMany = vi.mocked(prisma.budgetActionItem.updateMany);

const current: CampaignBudget[] = [
  {
    entityKey: "夏季轉換",
    entityLabel: "夏季轉換",
    platform: "meta",
    accountName: "魔幻主義",
    budgetType: "daily",
    budgetValue: 800,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  logCreate.mockResolvedValue({ id: "log1" } as never);
});

describe("syncCampaignSnapshots", () => {
  it("首見（無既有快照）只建 baseline 快照，不寫 changelog、不對帳", async () => {
    snapFindMany.mockResolvedValue([]);
    const changed = await syncCampaignSnapshots("u1", current);
    expect(changed).toBe(0);
    expect(logCreate).not.toHaveBeenCalled();
    expect(itemUpdateMany).not.toHaveBeenCalled();
    expect(snapUpsert).toHaveBeenCalledOnce();
  });

  it("偵測到值變更時寫 changelog 並關閉該帳號 open 待辦（自動對帳）", async () => {
    snapFindMany.mockResolvedValue([
      { entityKey: "夏季轉換", budgetType: "daily", budgetValue: 400 } as never,
    ]);
    const changed = await syncCampaignSnapshots("u1", current);
    expect(changed).toBe(1);
    expect(logCreate.mock.calls[0][0].data).toMatchObject({
      source: "platform_detected",
      previousValue: 400,
      newValue: 800,
    });
    expect(itemUpdateMany.mock.calls[0][0]).toMatchObject({
      where: {
        userId: "u1",
        accountName: "魔幻主義",
        reason: "pacing_overspend",
        status: "open",
      },
      data: {
        status: "resolved",
        resolvedBy: "auto_detected_change",
        linkedChangeLogId: "log1",
      },
    });
  });
});

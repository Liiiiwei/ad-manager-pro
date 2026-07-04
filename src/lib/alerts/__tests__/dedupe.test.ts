import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TriggeredAlert } from "@/lib/alerts/types";

// mock prisma（測試不打真 DB）
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alertNotification: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { taipeiStartOfDay, saveNewAlertNotifications } from "../dedupe";

const findManyMock = vi.mocked(prisma.alertNotification.findMany);
const createMock = vi.mocked(prisma.alertNotification.create);

/** 產生測試用 TriggeredAlert */
function makeAlert(overrides: Partial<TriggeredAlert> = {}): TriggeredAlert {
  return {
    ruleId: "rule-1",
    ruleName: "測試規則",
    title: "花費異常",
    message: "花費 200 超過閾值 100",
    metric: "spend",
    currentValue: 200,
    previousValue: 100,
    changePercent: 100,
    severity: "warning",
    ...overrides,
  };
}

describe("taipeiStartOfDay", () => {
  it("UTC 深夜換日邊界：台北 07-04 01:00 的當日起點是 07-03T16:00Z", () => {
    // UTC 2026-07-03 17:00 = 台北 2026-07-04 01:00
    const start = taipeiStartOfDay(new Date("2026-07-03T17:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });
});

describe("saveNewAlertNotifications", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    createMock.mockReset();
  });

  it("空觸發清單：不打 DB，回空結果", async () => {
    const result = await saveNewAlertNotifications("user-1", []);

    expect(result).toEqual({ newAlerts: [], notifications: [] });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("今日已有同規則通知 → 過濾不重寫", async () => {
    findManyMock.mockResolvedValue([{ ruleId: "rule-1" }] as never);

    const result = await saveNewAlertNotifications("user-1", [makeAlert()]);

    expect(result.newAlerts).toEqual([]);
    expect(result.notifications).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("新規則 → 寫入且 create data 欄位正確（含 read: false）", async () => {
    findManyMock.mockResolvedValue([] as never);
    const created = { id: "n-1", ruleId: "rule-1" };
    createMock.mockResolvedValue(created as never);

    const alert = makeAlert();
    const now = new Date("2026-07-04T09:00:00+08:00");
    const result = await saveNewAlertNotifications("user-1", [alert], now);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        ruleId: "rule-1",
        userId: "user-1",
        title: "花費異常",
        message: "花費 200 超過閾值 100",
        metric: "spend",
        currentValue: 200,
        previousValue: 100,
        changePercent: 100,
        severity: "warning",
        read: false,
      },
    });
    expect(result.newAlerts).toEqual([alert]);
    expect(result.notifications).toEqual([created]);

    // 去重查詢以台北當日 00:00 為界
    const where = findManyMock.mock.calls[0][0]?.where as {
      createdAt: { gte: Date };
    };
    expect(where.createdAt.gte.toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });

  it("混合情境：兩新一舊 → 只寫兩筆新的", async () => {
    findManyMock.mockResolvedValue([{ ruleId: "rule-old" }] as never);
    createMock.mockResolvedValue({ id: "n-x" } as never);

    const alerts = [
      makeAlert({ ruleId: "rule-old" }),
      makeAlert({ ruleId: "rule-a" }),
      makeAlert({ ruleId: "rule-b" }),
    ];
    const result = await saveNewAlertNotifications("user-1", alerts);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.newAlerts.map((a) => a.ruleId)).toEqual(["rule-a", "rule-b"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetActionItem: { findMany: vi.fn(), updateMany: vi.fn() },
    budgetChangeLog: { findMany: vi.fn() },
  },
}));

import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { GET } from "../action-items/route";
import { PATCH } from "../action-items/[id]/route";

const currentUser = vi.mocked(getCurrentUser);
const findMany = vi.mocked(prisma.budgetActionItem.findMany);
const updateMany = vi.mocked(prisma.budgetActionItem.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue({ id: "u1" } as never);
});

describe("GET /api/budget/action-items", () => {
  it("回傳當前 user 的待辦", async () => {
    findMany.mockResolvedValue([
      { id: "a1", accountName: "魔幻主義" },
    ] as never);
    const res = await GET(
      new Request("http://t/api/budget/action-items") as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    const where = findMany.mock.calls[0][0]?.where as { userId: string };
    expect(where.userId).toBe("u1");
  });
});

describe("PATCH /api/budget/action-items/[id]", () => {
  it("resolve 帶 userId 防越權", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);
    const req = new Request("http://t/api/budget/action-items/a1", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    const res = await PATCH(
      req as never,
      { params: Promise.resolve({ id: "a1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      id: "a1",
      userId: "u1",
    });
    expect(updateMany.mock.calls[0][0].data.status).toBe("resolved");
  });

  it("非法 status 回 400", async () => {
    const req = new Request("http://t/api/budget/action-items/a1", {
      method: "PATCH",
      body: JSON.stringify({ status: "bogus" }),
    });
    const res = await PATCH(
      req as never,
      { params: Promise.resolve({ id: "a1" }) } as never,
    );
    expect(res.status).toBe(400);
  });
});

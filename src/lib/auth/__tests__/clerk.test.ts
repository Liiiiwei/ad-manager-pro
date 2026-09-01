import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { getCurrentUser } from "../clerk";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);

describe("getCurrentUser 免登入 fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // 預設：未登入
    mockAuth.mockResolvedValue({ userId: null } as never);
  });

  it("production + LOCAL_NO_AUTH=true：建立並回傳 dev-local-user", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "true");
    mockFindUnique.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({
      id: "u1",
      clerkId: "dev-local-user",
      email: "dev@localhost",
    } as never);

    const user = await getCurrentUser();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerkId: "dev-local-user",
          email: "dev@localhost",
        }),
      }),
    );
    expect(user.clerkId).toBe("dev-local-user");
  });

  it("production 且未設 LOCAL_NO_AUTH：丟出未登入、不碰 DB", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "");

    await expect(getCurrentUser()).rejects.toThrow("未登入");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

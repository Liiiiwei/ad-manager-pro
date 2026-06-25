import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/repositories/user-settings", () => ({
  getUserSettings: vi.fn(),
}));

vi.mock("@/lib/utils/crypto", () => ({
  decryptApiKey: vi.fn((s: string) => `decrypted-${s}`),
}));

import { requireWindsorApiKey } from "../require-windsor-key";
import { getCurrentUser } from "@/lib/auth/clerk";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { _resetRateLimitForTest } from "@/lib/utils/rate-limit";
import { NextResponse } from "next/server";

function req(): Request {
  return new Request("http://localhost/api/test", {
    method: "GET",
    headers: { "x-real-ip": "1.1.1.1" },
  });
}

const fakeUser = { id: "user-1", clerkId: "clerk-1" } as unknown as Awaited<
  ReturnType<typeof getCurrentUser>
>;

describe("requireWindsorApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitForTest();
  });

  it("settings.windsorApiKey 不存在時回 412 + WINDSOR_KEY_MISSING", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser);
    vi.mocked(getUserSettings).mockResolvedValue({
      windsorApiKey: null,
    } as never);

    const result = await requireWindsorApiKey(req());
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(412);
    const body = await res.json();
    expect(body.code).toBe("WINDSOR_KEY_MISSING");
  });

  it("settings 整個不存在時也回 412 + WINDSOR_KEY_MISSING", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser);
    vi.mocked(getUserSettings).mockResolvedValue(null);

    const result = await requireWindsorApiKey(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(412);
  });

  it("有 key 時回 { user, apiKey(已解密) }", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser);
    vi.mocked(getUserSettings).mockResolvedValue({
      windsorApiKey: "enc-abc",
    } as never);

    const result = await requireWindsorApiKey(req());
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.user).toBe(fakeUser);
    expect(result.apiKey).toBe("decrypted-enc-abc");
  });

  it("超過速率限制時回 429（bucket 以 user.id 隔離）", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser);
    vi.mocked(getUserSettings).mockResolvedValue({
      windsorApiKey: "enc-abc",
    } as never);

    const rl = { maxRequests: 1, windowMs: 60_000 };

    const ok = await requireWindsorApiKey(req(), rl);
    expect(ok).not.toBeInstanceOf(NextResponse);

    const blocked = await requireWindsorApiKey(req(), rl);
    expect(blocked).toBeInstanceOf(NextResponse);
    expect((blocked as NextResponse).status).toBe(429);
  });

  it("不同 user.id 即使同 IP 也獨立計數", async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      windsorApiKey: "enc-x",
    } as never);

    const rl = { maxRequests: 1, windowMs: 60_000 };

    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      ...fakeUser,
      id: "user-A",
    } as never);
    const a1 = await requireWindsorApiKey(req(), rl);
    expect(a1).not.toBeInstanceOf(NextResponse);

    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      ...fakeUser,
      id: "user-B",
    } as never);
    const b1 = await requireWindsorApiKey(req(), rl);
    expect(b1).not.toBeInstanceOf(NextResponse);

    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      ...fakeUser,
      id: "user-A",
    } as never);
    const a2 = await requireWindsorApiKey(req(), rl);
    expect(a2).toBeInstanceOf(NextResponse);
    expect((a2 as NextResponse).status).toBe(429);
  });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
});

/**
 * PATCH /api/budget/action-items/[id]
 * 標記預算待辦為 resolved / dismissed（僅限當前使用者所屬的待辦，updateMany 防越權）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請求格式錯誤", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await prisma.budgetActionItem.updateMany({
      where: { id, userId: user.id },
      data: {
        status: parsed.data.status,
        resolvedBy: "manual",
        resolvedAt: new Date(),
      },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "找不到待辦或無權限" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新預算待辦失敗:", error);
    return NextResponse.json(
      {
        error: "更新預算待辦失敗",
        details:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}

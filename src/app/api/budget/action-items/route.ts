import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/budget/action-items
 * 取得當前使用者的預算待辦（預設 open 狀態）
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const status = new URL(request.url).searchParams.get("status") ?? "open";
    const items = await prisma.budgetActionItem.findMany({
      where: { userId: user.id, status },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("讀取預算待辦失敗:", error);
    return NextResponse.json(
      {
        error: "讀取預算待辦失敗",
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

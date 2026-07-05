import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/budget/change-log
 * 取得當前使用者的預算變更紀錄，依偵測時間新到舊排序
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const limitRaw = new URL(request.url).searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 100);
    const changes = await prisma.budgetChangeLog.findMany({
      where: { userId: user.id },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ changes });
  } catch (error) {
    console.error("讀取預算變更紀錄失敗:", error);
    return NextResponse.json(
      {
        error: "讀取預算變更紀錄失敗",
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

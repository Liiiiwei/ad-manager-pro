import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/clerk";

// alertKey 由 alertStableKey() 產生（內容穩定鍵），長度有上限避免濫用
const bodySchema = z.object({
  alertKey: z.string().min(1).max(500),
});

function errorResponse(message: string, error: unknown, status = 500) {
  return NextResponse.json(
    {
      error: message,
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
    },
    { status },
  );
}

/**
 * GET /api/alerts/resolved
 * 回傳目前使用者所有已標記「已處理」的 alertKey 陣列
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await prisma.resolvedAlert.findMany({
      where: { userId: user.id },
      select: { alertKey: true },
    });
    return NextResponse.json({ keys: rows.map((r) => r.alertKey) });
  } catch (error) {
    console.error("讀取已處理警示失敗:", error);
    return errorResponse("讀取已處理警示失敗", error);
  }
}

/**
 * POST /api/alerts/resolved  body: { alertKey }
 * 標記為已處理（冪等 upsert，重複標記不報錯）
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請求格式錯誤", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await prisma.resolvedAlert.upsert({
      where: {
        userId_alertKey: { userId: user.id, alertKey: parsed.data.alertKey },
      },
      create: { userId: user.id, alertKey: parsed.data.alertKey },
      update: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("標記已處理失敗:", error);
    return errorResponse("標記已處理失敗", error);
  }
}

/**
 * DELETE /api/alerts/resolved  body: { alertKey }
 * 取消已處理標記（恢復未處理）
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請求格式錯誤", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // deleteMany + userId 條件：確保只能刪自己的，且不存在時不報錯（冪等）
    await prisma.resolvedAlert.deleteMany({
      where: { userId: user.id, alertKey: parsed.data.alertKey },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("取消已處理失敗:", error);
    return errorResponse("取消已處理失敗", error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/clerk";

/**
 * GET /api/alerts/notifications
 * 查詢通知列表，支援 unread 篩選與 limit 分頁
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";
    // 限制查詢筆數在 1~200 之間
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1),
      200,
    );

    const where = {
      userId: user.id,
      ...(unreadOnly ? { read: false } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.alertNotification.findMany({
        where,
        include: {
          rule: {
            select: { name: true, metric: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.alertNotification.count({
        where: { userId: user.id, read: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("讀取通知失敗:", error);
    return NextResponse.json(
      {
        error: "讀取通知失敗",
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

/**
 * PATCH /api/alerts/notifications
 * 標記通知為已讀：markAllRead: true 或 id: "notification-id"
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();

    if (body.markAllRead === true) {
      // 將所有未讀通知標記為已讀
      await prisma.alertNotification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
    } else if (body.id) {
      // 標記單一通知為已讀（確保只能操作自己的通知）
      await prisma.alertNotification.updateMany({
        where: { id: body.id, userId: user.id },
        data: { read: true },
      });
    } else {
      return NextResponse.json(
        { error: "請提供 markAllRead 或 id 參數" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新通知失敗:", error);
    return NextResponse.json(
      {
        error: "更新通知失敗",
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

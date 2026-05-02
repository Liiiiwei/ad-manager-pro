import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

// 警報規則建立的 Zod 驗證 schema
const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum([
    "spend",
    "roas",
    "ctr",
    "cpc",
    "cpm",
    "impressions",
    "clicks",
    "conversions",
  ]),
  condition: z.enum(["above", "below"]),
  threshold: z.number().finite().nonnegative(),
  platform: z.string().max(100).optional(),
  campaignFilter: z.string().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/alerts/rules
 * 取得當前使用者的所有警報規則
 */
export async function GET() {
  try {
    const user = await getCurrentUser();

    const rules = await prisma.alertRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("讀取警報規則失敗:", error);
    return NextResponse.json(
      {
        error: "讀取警報規則失敗",
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
 * POST /api/alerts/rules
 * 建立新的警報規則
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const raw = await request.json();
    const parsed = ruleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "輸入驗證失敗",
          details:
            process.env.NODE_ENV === "production"
              ? undefined
              : parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const rule = await prisma.alertRule.create({
      data: {
        userId: user.id,
        name: body.name,
        metric: body.metric,
        condition: body.condition,
        threshold: body.threshold,
        platform: body.platform,
        campaignFilter: body.campaignFilter ?? null,
        enabled: body.enabled ?? true,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("建立警報規則失敗:", error);
    return NextResponse.json(
      {
        error: "建立警報規則失敗",
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
 * PATCH /api/alerts/rules
 * 更新警報規則（需驗證擁有者）
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少規則 ID" }, { status: 400 });
    }

    // 只允許更新特定欄位，防止 mass assignment 攻擊
    const allowedFields = [
      "name",
      "metric",
      "condition",
      "threshold",
      "platform",
      "campaignFilter",
      "enabled",
    ];
    const sanitizedUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) sanitizedUpdates[key] = body[key];
    }

    const result = await prisma.alertRule.updateMany({
      where: { id, userId: user.id },
      data: sanitizedUpdates,
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "規則不存在或無權限修改" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新警報規則失敗:", error);
    return NextResponse.json(
      {
        error: "更新警報規則失敗",
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
 * DELETE /api/alerts/rules?id=xxx
 * 刪除警報規則（需驗證擁有者）
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少規則 ID" }, { status: 400 });
    }

    const result = await prisma.alertRule.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "規則不存在或無權限刪除" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("刪除警報規則失敗:", error);
    return NextResponse.json(
      {
        error: "刪除警報規則失敗",
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

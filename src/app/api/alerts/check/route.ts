import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/clerk";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";

/**
 * POST /api/alerts/check
 * 執行規則檢查，並儲存觸發的通知（每日去重）
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    // 從 header 取得 Windsor API Key
    const apiKey = req.headers.get("x-windsor-api-key");
    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 x-windsor-api-key header" },
        { status: 400 },
      );
    }

    // 取得使用者啟用的警報規則
    const rules = await prisma.alertRule.findMany({
      where: { userId: user.id, enabled: true },
    });

    if (rules.length === 0) {
      return NextResponse.json({ triggered: [], checkedRules: 0 });
    }

    // 抓取過去 14 天的 Windsor 資料
    const query = buildAdPerformanceQuery("all", "last_14d");
    const { data } = await fetchWindsor(apiKey, query);

    // 執行規則檢查
    const triggeredAlerts = checkRules(rules, data);

    // 每日去重：同一規則當天只觸發一次
    const today = new Date().toISOString().slice(0, 10);
    const newNotifications = [];

    for (const alert of triggeredAlerts) {
      const existing = await prisma.alertNotification.findFirst({
        where: {
          ruleId: alert.ruleId,
          userId: user.id,
          createdAt: { gte: new Date(`${today}T00:00:00Z`) },
        },
      });

      if (!existing) {
        const notification = await prisma.alertNotification.create({
          data: {
            ruleId: alert.ruleId,
            userId: user.id,
            title: alert.title,
            message: alert.message,
            metric: alert.metric,
            currentValue: alert.currentValue,
            previousValue: alert.previousValue,
            changePercent: alert.changePercent,
            severity: alert.severity,
            read: false,
          },
        });
        newNotifications.push(notification);
      }
    }

    return NextResponse.json({
      triggered: newNotifications,
      checkedRules: rules.length,
    });
  } catch (error) {
    console.error("規則檢查失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "規則檢查失敗" },
      { status: 500 },
    );
  }
}

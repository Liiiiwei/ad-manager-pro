import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/clerk";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";
import { withRateLimit } from "@/lib/utils/with-rate-limit";

/**
 * POST /api/alerts/check
 * 執行規則檢查，並儲存觸發的通知（每日去重）
 */
export async function POST(req: NextRequest) {
  const rateLimited = withRateLimit(req, { maxRequests: 10, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  try {
    const user = await getCurrentUser();

    // 從資料庫讀取 Windsor API Key
    const settings = await prisma.userSettings.findFirst({
      where: { userId: user.id },
    });
    if (!settings?.windsorApiKey) {
      return NextResponse.json(
        { error: "請先在設定頁面設定 Windsor API Key" },
        { status: 400 },
      );
    }
    const apiKey = decryptApiKey(settings.windsorApiKey);

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

    // 每日去重：同一規則當天只觸發一次（以台北時區為基準）
    const today = new Date().toLocaleDateString("sv", {
      timeZone: "Asia/Taipei",
    });
    const startOfDay = new Date(`${today}T00:00:00+08:00`);
    const ruleIds = triggeredAlerts.map((a) => a.ruleId);
    const newNotifications = [];

    // 批次查詢今日已存在的通知，避免 N+1 問題
    if (ruleIds.length > 0) {
      const existingToday = await prisma.alertNotification.findMany({
        where: {
          ruleId: { in: ruleIds },
          userId: user.id,
          createdAt: { gte: startOfDay },
        },
        select: { ruleId: true },
      });
      const existingRuleIds = new Set(
        existingToday.map((n: { ruleId: string }) => n.ruleId),
      );

      for (const alert of triggeredAlerts) {
        if (existingRuleIds.has(alert.ruleId)) continue;

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
      {
        error: "規則檢查失敗",
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

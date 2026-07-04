import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireWindsorApiKey } from "@/lib/auth/require-windsor-key";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";

/**
 * POST /api/alerts/check
 * 執行規則檢查，並儲存觸發的通知（每日去重）
 */
export async function POST(req: NextRequest) {
  const gate = await requireWindsorApiKey(req, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (gate instanceof NextResponse) return gate;
  const { user, apiKey } = gate;

  try {
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

    // 每日去重寫入（與 LINE 盤中異常任務共用同一套邏輯）
    const { notifications } = await saveNewAlertNotifications(
      user.id,
      triggeredAlerts,
    );

    return NextResponse.json({
      triggered: notifications,
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

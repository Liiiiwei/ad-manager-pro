import type { UserSettings } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { buildWeeklySummary } from "@/lib/digest/build-weekly-summary";
import { mergeAccountBudgets } from "@/lib/settings/account-budgets";
import { pushFlex, pushText } from "@/lib/line/client";
import { buildWeeklyFlex, buildWeeklyText } from "@/lib/line/flex";
import { getAppUrl } from "@/lib/cron/monitor-jobs";

/**
 * 叮咚週報推播任務（每週一 09:00 台北）。
 *
 * 這是 monitor-jobs.ts 每日摘要分支的平行複製版：查詢、組裝、gate 三處不同，
 * 逐使用者 try/catch 錯誤隔離、pushFlex 失敗退 pushText 的模式原封不動照抄。
 * 獨立成檔以確保 monitor-jobs.ts 的日報函式完全不受影響。
 *
 * 註：resolveCredentials 在 monitor-jobs.ts 是 module-private 未 export，
 * 為維持該檔一字不動，這裡重寫一份等價邏輯（log 前綴改 [weekly]）。
 */

/** 解密後的推播憑證 */
interface ResolvedCredentials {
  channelToken: string;
  recipientId: string;
  windsorApiKey: string;
}

/**
 * 取出並解密使用者憑證；缺任一項或解密失敗（ENCRYPTION_KEY 錯誤）
 * 都記 log 回 null，由呼叫端跳過該使用者。
 */
function resolveCredentials(
  settings: UserSettings,
): ResolvedCredentials | null {
  if (
    !settings.lineChannelToken ||
    !settings.lineRecipientId ||
    !settings.windsorApiKey
  ) {
    console.log(
      `[weekly] 使用者 ${settings.userId} 缺 LINE/Windsor 憑證，跳過`,
    );
    return null;
  }
  try {
    return {
      channelToken: decryptApiKey(settings.lineChannelToken),
      recipientId: settings.lineRecipientId,
      windsorApiKey: decryptApiKey(settings.windsorApiKey),
    };
  } catch (error) {
    console.error(
      `[weekly] 使用者 ${settings.userId} 憑證解密失敗（檢查 ENCRYPTION_KEY）:`,
      error,
    );
    return null;
  }
}

/**
 * 取出所有「已開 LINE 總開關且已開週報」的使用者設定。
 * 兩層 gate：linePushEnabled（總 LINE 開關）+ weeklyReportEnabled（週報獨立開關），
 * 讓「日報開、週報關」等組合可行。
 */
function getWeeklyEnabledSettings(): Promise<UserSettings[]> {
  return prisma.userSettings.findMany({
    where: { linePushEnabled: true, weeklyReportEnabled: true },
  });
}

/** 單一使用者的週報推播 */
export async function runWeeklyReportForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  const creds = resolveCredentials(settings);
  if (!creds) return;

  // 抓過去 14 天（涵蓋本週 7 天 + 上週 7 天做 WoW）。
  // 週報不需預算欄位，用較輕的 AdPerformance 欄位組（同盤中異常任務）。
  let records;
  try {
    const query = buildAdPerformanceQuery("all", "last_14d");
    const result = await fetchWindsor(creds.windsorApiKey, query);
    records = result.data;
  } catch (error) {
    console.error(
      `[weekly] 使用者 ${settings.userId} Windsor 抓取失敗:`,
      error,
    );
    return;
  }

  // 分帳號週配速用的手動月預算（accountBudgets Json）；淨化後帶入純函式
  const manualBudgets = mergeAccountBudgets(settings.accountBudgets, {});
  const summary = buildWeeklySummary(records, { now, manualBudgets });

  const appUrl = getAppUrl();
  const altText = `每週廣告週報 ${summary.weekStart}~${summary.weekEnd}`;
  let result;
  try {
    const bubble = buildWeeklyFlex(summary, appUrl);
    result = await pushFlex(
      creds.channelToken,
      creds.recipientId,
      bubble,
      altText,
    );
  } catch (error) {
    // Flex 組裝異常 → 退純文字備援
    console.error(
      `[weekly] 使用者 ${settings.userId} Flex 組裝失敗，改用純文字:`,
      error,
    );
    result = await pushText(
      creds.channelToken,
      creds.recipientId,
      buildWeeklyText(summary, appUrl),
    );
  }

  if (!result.ok) {
    // LINE API 4xx/5xx/429 → 記 log 放棄，不重試
    console.error(
      `[weekly] 使用者 ${settings.userId} LINE 推播失敗: status=${result.status} error=${result.error}`,
    );
  }
}

/** 週報：對所有啟用週報的使用者逐一執行（彼此錯誤隔離） */
export async function runWeeklyReportForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await getWeeklyEnabledSettings();
  console.log(`[weekly] 週報開始，共 ${allSettings.length} 位使用者`);

  for (const settings of allSettings) {
    try {
      await runWeeklyReportForUser(settings, now);
    } catch (error) {
      console.error(`[weekly] 使用者 ${settings.userId} 週報失敗:`, error);
    }
  }
}

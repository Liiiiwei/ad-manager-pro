import type { UserSettings } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import {
  buildInitiativeQuery,
  buildAdPerformanceQuery,
} from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";
import { mergeAccountBudgets } from "@/lib/settings/account-budgets";
import { detectPacingOverspend } from "@/lib/budget/pacing";
import { syncPacingActionItems } from "@/lib/budget/action-items";
import {
  extractCampaignBudgets,
  syncCampaignSnapshots,
} from "@/lib/budget/snapshot";
import {
  buildDailySummary,
  deriveDigestDates,
} from "@/lib/digest/build-daily-summary";
import { pushFlex, pushText } from "@/lib/line/client";
import {
  buildDigestFlex,
  buildAlertFlex,
  buildDigestText,
  buildAlertText,
} from "@/lib/line/flex";

/** 應用網址（LINE 訊息按鈕連結用） */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

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
      `[monitor] 使用者 ${settings.userId} 缺 LINE/Windsor 憑證，跳過`,
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
      `[monitor] 使用者 ${settings.userId} 憑證解密失敗（檢查 ENCRYPTION_KEY）:`,
      error,
    );
    return null;
  }
}

/** 取出所有啟用 LINE 推播的使用者設定 */
function getLineEnabledSettings(): Promise<UserSettings[]> {
  return prisma.userSettings.findMany({ where: { linePushEnabled: true } });
}

/** 單一使用者的每日摘要 */
async function runDailyDigestForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  const creds = resolveCredentials(settings);
  if (!creds) return;

  // 抓 60 天資料（涵蓋整個月＋昨日）。
  // 摘要需要預算欄位，必須用 initiative 查詢（AdPerformance 欄位組沒有預算欄位）。
  let records;
  try {
    const query = buildInitiativeQuery("all", "last_60d");
    const result = await fetchWindsor(creds.windsorApiKey, query);
    records = result.data;
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Windsor 抓取失敗:`,
      error,
    );
    return;
  }

  // 規則檢查（摘要僅呈現件數與內容，不寫 DB、不去重——寫入由盤中異常任務負責）
  const rules = await prisma.alertRule.findMany({
    where: { userId: settings.userId, enabled: true },
  });
  const alerts = checkRules(rules, records);

  // DB 的 accountBudgets 是未驗證 JSON，過 mergeAccountBudgets 淨化
  const manualBudgets = mergeAccountBudgets(settings.accountBudgets, {});
  const summary = buildDailySummary(records, {
    manualBudgets,
    today: now,
    daysInMonth: deriveDigestDates(now).daysInMonth,
    alerts,
  });

  // 預算閉環：配速超支偵測 → 待辦；平台預算變更 → 快照/紀錄/自動對帳
  // 屬次要功能，失敗不應拖垮核心摘要推播 → 包 try/catch，失敗時退回 0 並記 log
  let budgetActionItemCount = 0;
  try {
    const violations = detectPacingOverspend(summary.accounts);
    // 帶入本次觀測到的帳號 → 配速回正／預算移除的 open 待辦自動結案
    await syncPacingActionItems(settings.userId, violations, summary.accounts);
    await syncCampaignSnapshots(
      settings.userId,
      extractCampaignBudgets(records),
    );
    budgetActionItemCount = await prisma.budgetActionItem.count({
      where: {
        userId: settings.userId,
        reason: "pacing_overspend",
        status: "open",
      },
    });
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} 預算閉環處理失敗，跳過（不影響核心摘要）:`,
      error,
    );
  }

  const appUrl = getAppUrl();
  const altText = `每日廣告摘要 ${summary.date}`;
  let result;
  try {
    const bubble = buildDigestFlex(summary, appUrl, budgetActionItemCount);
    result = await pushFlex(
      creds.channelToken,
      creds.recipientId,
      bubble,
      altText,
    );
  } catch (error) {
    // Flex 組裝異常 → 退純文字備援
    console.error(
      `[monitor] 使用者 ${settings.userId} Flex 組裝失敗，改用純文字:`,
      error,
    );
    result = await pushText(
      creds.channelToken,
      creds.recipientId,
      buildDigestText(summary, appUrl),
    );
  }

  if (!result.ok) {
    // LINE API 4xx/5xx/429 → 記 log 放棄，不重試
    console.error(
      `[monitor] 使用者 ${settings.userId} LINE 推播失敗: status=${result.status} error=${result.error}`,
    );
  }
}

/** 每日摘要：對所有啟用 LINE 推播的使用者逐一執行（彼此錯誤隔離） */
export async function runDailyDigestForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await getLineEnabledSettings();
  console.log(`[monitor] 每日摘要開始，共 ${allSettings.length} 位使用者`);

  for (const settings of allSettings) {
    try {
      await runDailyDigestForUser(settings, now);
    } catch (error) {
      console.error(`[monitor] 使用者 ${settings.userId} 每日摘要失敗:`, error);
    }
  }
}

/** 單一使用者的盤中異常檢查 */
async function runAnomalyCheckForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  const creds = resolveCredentials(settings);
  if (!creds) return;

  const rules = await prisma.alertRule.findMany({
    where: { userId: settings.userId, enabled: true },
  });
  if (rules.length === 0) return;

  // 與既有 /api/alerts/check 相同的資料範圍（last_14d、AdPerformance 欄位組）
  let records;
  try {
    const query = buildAdPerformanceQuery("all", "last_14d");
    const result = await fetchWindsor(creds.windsorApiKey, query);
    records = result.data;
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Windsor 抓取失敗:`,
      error,
    );
    return;
  }

  const triggered = checkRules(rules, records);
  const { newAlerts } = await saveNewAlertNotifications(
    settings.userId,
    triggered,
    now,
  );

  // 今日已通知過的規則不再推播（不打擾）
  if (newAlerts.length === 0) return;

  const appUrl = getAppUrl();
  const altText = `廣告異常提醒（${newAlerts.length} 件）`;
  let result;
  try {
    const bubble = buildAlertFlex(newAlerts, appUrl);
    result = await pushFlex(
      creds.channelToken,
      creds.recipientId,
      bubble,
      altText,
    );
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Flex 組裝失敗，改用純文字:`,
      error,
    );
    result = await pushText(
      creds.channelToken,
      creds.recipientId,
      buildAlertText(newAlerts, appUrl),
    );
  }

  if (!result.ok) {
    console.error(
      `[monitor] 使用者 ${settings.userId} LINE 推播失敗: status=${result.status} error=${result.error}`,
    );
  }
}

/** 盤中異常檢查：對所有啟用 LINE 推播的使用者逐一執行（彼此錯誤隔離） */
export async function runAnomalyCheckForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await getLineEnabledSettings();
  console.log(`[monitor] 盤中異常檢查開始，共 ${allSettings.length} 位使用者`);

  for (const settings of allSettings) {
    try {
      await runAnomalyCheckForUser(settings, now);
    } catch (error) {
      console.error(`[monitor] 使用者 ${settings.userId} 異常檢查失敗:`, error);
    }
  }
}

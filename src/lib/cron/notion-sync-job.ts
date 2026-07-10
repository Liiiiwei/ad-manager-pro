import type { Prisma, UserSettings } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildInitiativeQuery } from "@/lib/windsor/queries";
import { mergeAccountBudgets } from "@/lib/settings/account-budgets";
import {
  buildDailySummary,
  deriveDigestDates,
} from "@/lib/digest/build-daily-summary";
import { createNotionClient } from "@/lib/notion/client";
import { ensureNotionDatabases } from "@/lib/notion/databases";
import {
  buildDailyPerformanceRows,
  upsertDailyRows,
} from "@/lib/notion/daily-rows";
import { pushChangeLogsToNotion } from "@/lib/notion/changelog-sync";
import {
  pullResolvedFromNotion,
  pushActionItemsToNotion,
} from "@/lib/notion/action-item-sync";
import { createSyncLog, failSyncLog } from "@/lib/db/repositories/sync-log";
import { updateUserSettings } from "@/lib/db/repositories/user-settings";

/** SyncLog 的任務種類（區分既有日報頁面同步 "page_sync"） */
const JOB_TYPE = "notion_db_sync";

/** 錯誤 → 一行可讀訊息 */
function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 單一子任務的結果（A 每日成效 / B 操作日誌 / C 待辦） */
interface SubtaskResult {
  label: string;
  ok: boolean;
  detail: string;
}

/** 組 SyncLog.errorMessage 的一行摘要：「每日成效: ok(建3更新7)｜操作日誌: 失敗(...)｜待辦: ok(讀回1推送2)」 */
function formatSummary(results: SubtaskResult[]): string {
  return results
    .map((r) => `${r.label}: ${r.ok ? `ok(${r.detail})` : `失敗(${r.detail})`}`)
    .join("｜");
}

/**
 * 單一使用者的 Notion database 同步（每日 12:10）。
 * 固定順序（§7.2）：ensure DB → 每日成效 → 操作日誌 → 待辦（先讀回再推送）。
 * 三個子任務各自 try/catch、best-effort；部分成功記 PARTIAL；本函式不 throw（cron 語意）。
 * 全流程冪等：daily upsert、changelog null 錨點、待辦 status=open 條件——隔日重跑自癒。
 */
export async function runNotionDatabaseSyncForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  // 前置：憑證齊全才跑（比照 monitor-jobs resolveCredentials 風格）
  if (
    !settings.notionEnabled ||
    !settings.notionApiKey ||
    !settings.notionParentPageId
  ) {
    console.log(
      `[notion-sync] 使用者 ${settings.userId} 未啟用或缺 Notion 憑證，跳過`,
    );
    return;
  }
  let notionKey: string;
  try {
    notionKey = decryptApiKey(settings.notionApiKey);
  } catch (error) {
    console.error(
      `[notion-sync] 使用者 ${settings.userId} Notion 憑證解密失敗（檢查 ENCRYPTION_KEY）:`,
      error,
    );
    return;
  }

  const syncLog = await createSyncLog(settings.userId, JOB_TYPE);
  const notion = createNotionClient(notionKey);

  // 三個 DB 存在性檢查／自動建立／遺失重建；此步失敗（含 parentPageId 無效）→ 整輪 FAILED
  let ids;
  try {
    const ensured = await ensureNotionDatabases(
      notion,
      settings.notionParentPageId,
      settings.notionDatabases,
    );
    ids = ensured.ids;
    if (ensured.changed) {
      await updateUserSettings(settings.userId, {
        notionDatabases: ids as unknown as Prisma.InputJsonValue,
      });
    }
    // 重建善後（§3.4）：清空對應表 notionPageId 觸發下輪（本輪）全量重推；daily 無需善後
    if (ensured.rebuilt.includes("changelog")) {
      await prisma.budgetChangeLog.updateMany({
        where: { userId: settings.userId },
        data: { notionPageId: null },
      });
    }
    if (ensured.rebuilt.includes("todo")) {
      await prisma.budgetActionItem.updateMany({
        where: { userId: settings.userId },
        data: { notionPageId: null },
      });
    }
  } catch (error) {
    console.error(
      `[notion-sync] 使用者 ${settings.userId} Notion database 檢查/建立失敗:`,
      error,
    );
    await failSyncLog(
      syncLog.id,
      `Notion database 檢查/建立失敗: ${errorMessageOf(error)}`,
    );
    return;
  }

  // [子任務 A] 每日成效：Windsor last_60d → 昨日每帳號一 row，upsert
  // Windsor 失敗只讓 A 失敗，B/C 不依賴 Windsor，照跑
  let dailyResult: SubtaskResult;
  try {
    if (!settings.windsorApiKey) {
      throw new Error("缺 Windsor 憑證");
    }
    const windsorKey = decryptApiKey(settings.windsorApiKey);
    const query = buildInitiativeQuery("all", "last_60d");
    const { data: records } = await fetchWindsor(windsorKey, query);

    const dates = deriveDigestDates(now);
    const manualBudgets = mergeAccountBudgets(settings.accountBudgets, {});
    const summary = buildDailySummary(records, {
      manualBudgets,
      today: now,
      daysInMonth: dates.daysInMonth,
    });
    const rows = buildDailyPerformanceRows(records, summary.accounts, dates);
    const { created, updated } = await upsertDailyRows(
      notion,
      ids.daily.dataSourceId,
      rows,
    );
    dailyResult = {
      label: "每日成效",
      ok: true,
      detail: `建${created}更新${updated}`,
    };
  } catch (error) {
    console.error(
      `[notion-sync] 使用者 ${settings.userId} 每日成效同步失敗:`,
      error,
    );
    dailyResult = {
      label: "每日成效",
      ok: false,
      detail: errorMessageOf(error),
    };
  }

  // [子任務 B] 操作日誌：notionPageId IS NULL → 建頁 → 回寫
  let changelogResult: SubtaskResult;
  try {
    const created = await pushChangeLogsToNotion(
      notion,
      ids.changelog.dataSourceId,
      settings.userId,
    );
    changelogResult = { label: "操作日誌", ok: true, detail: `新增${created}` };
  } catch (error) {
    console.error(
      `[notion-sync] 使用者 ${settings.userId} 操作日誌同步失敗:`,
      error,
    );
    changelogResult = {
      label: "操作日誌",
      ok: false,
      detail: errorMessageOf(error),
    };
  }

  // [子任務 C] 待辦：先讀回再推送（同輪內 app 狀態最新，推送不會蓋掉使用者剛勾的項目）。
  // pull 失敗即整個 C 失敗（不推送），避免用過期狀態覆寫 Notion。
  let todoResult: SubtaskResult;
  try {
    const pulled = await pullResolvedFromNotion(
      notion,
      ids.todo.dataSourceId,
      settings.userId,
    );
    const { created, updated } = await pushActionItemsToNotion(
      notion,
      ids.todo.dataSourceId,
      settings.userId,
      now,
    );
    todoResult = {
      label: "待辦",
      ok: true,
      detail: `讀回${pulled}推送${created + updated}`,
    };
  } catch (error) {
    console.error(
      `[notion-sync] 使用者 ${settings.userId} 待辦同步失敗:`,
      error,
    );
    todoResult = { label: "待辦", ok: false, detail: errorMessageOf(error) };
  }

  // SyncLog 收尾：全成功 SUCCESS／全失敗 FAILED／混合 PARTIAL；一行摘要供 /dashboard 列表顯示
  const results = [dailyResult, changelogResult, todoResult];
  const okCount = results.filter((r) => r.ok).length;
  const status =
    okCount === results.length
      ? "SUCCESS"
      : okCount === 0
        ? "FAILED"
        : "PARTIAL";
  await prisma.syncLog.update({
    where: { id: syncLog.id },
    data: {
      status,
      completedAt: new Date(),
      errorMessage: formatSummary(results),
    },
  });
  console.log(
    `[notion-sync] 使用者 ${settings.userId} 同步完成（${status}）: ${formatSummary(results)}`,
  );
}

/**
 * Notion database 同步：對所有 notionEnabled 且憑證齊全的使用者逐一執行（彼此錯誤隔離）。
 * 篩人條件與 12:00 digest（linePushEnabled）刻意不同——兩者不耦合，
 * Notion 掛掉不影響 LINE 是結構保證。
 */
export async function runNotionDatabaseSyncForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await prisma.userSettings.findMany({
    where: {
      notionEnabled: true,
      notionApiKey: { not: null },
      notionParentPageId: { not: null },
    },
  });
  console.log(
    `[notion-sync] Notion database 同步開始，共 ${allSettings.length} 位使用者`,
  );

  for (const settings of allSettings) {
    try {
      await runNotionDatabaseSyncForUser(settings, now);
    } catch (error) {
      console.error(
        `[notion-sync] 使用者 ${settings.userId} Notion 同步失敗:`,
        error,
      );
    }
  }
}

import cron from "node-cron";
import { initDynamicScheduler } from "./dynamic-scheduler";
import {
  runDailyDigestForAllUsers,
  runAnomalyCheckForAllUsers,
} from "./monitor-jobs";
import { runWeeklyReportForAllUsers } from "./weekly-jobs";
import { runNotionDatabaseSyncForAllUsers } from "./notion-sync-job";

// 使用 singleton pattern 確保只初始化一次
let cronInitialized = false;

/**
 * 初始化 Cron Jobs
 * 使用 singleton pattern 確保在 Next.js 環境中只執行一次
 */
export function initCronJobs(): void {
  if (cronInitialized) {
    return;
  }

  // 初始化動態排程系統（多租戶 SaaS）
  initDynamicScheduler();

  // 每日摘要：台北時間 12:00
  cron.schedule(
    "0 12 * * *",
    () => {
      runDailyDigestForAllUsers().catch((error) => {
        console.error("[cron] 每日摘要任務失敗:", error);
      });
    },
    { timezone: "Asia/Taipei" },
  );

  // 盤中異常檢查：台北時間 10 / 14 / 18 / 22 點
  cron.schedule(
    "0 10,14,18,22 * * *",
    () => {
      runAnomalyCheckForAllUsers().catch((error) => {
        console.error("[cron] 盤中異常檢查任務失敗:", error);
      });
    },
    { timezone: "Asia/Taipei" },
  );

  // 叮咚週報：台北時間週一 09:00（cron 週一 = 1）
  // ENABLE_LINE_CRON 多副本防護：cron.schedule 在每個 Node process 各跑一份，
  // 上方 singleton 只擋單一 process 內重複 init，擋不了多副本。現況是單使用者
  // （Vincent），實務風險低；上多副本前必須補 DB 冪等鎖（userId + weekStart 唯一鍵），
  // 否則使用者會收到 N 份週報。手法與 dynamic-scheduler 的 ENABLE_AUTO_SYNC 一致，
  // 只在單一指定副本不設此旗標（預設啟用），其餘副本設為 "false" 關閉。
  if (process.env.ENABLE_LINE_CRON !== "false") {
    cron.schedule(
      "0 9 * * 1",
      () => {
        runWeeklyReportForAllUsers().catch((error) => {
          console.error("[cron] 每週報告任務失敗:", error);
        });
      },
      { timezone: "Asia/Taipei" },
    );

    // Notion database 同步：台北時間每日 12:10（在 12:00 digest 之後，
    // 同輪產生的預算變更/待辦當天就上 Notion）。與 LINE 推播完全獨立，
    // Notion 掛掉不影響 LINE。多副本防護同上（ENABLE_LINE_CRON）。
    cron.schedule(
      "10 12 * * *",
      () => {
        runNotionDatabaseSyncForAllUsers().catch((error) => {
          console.error("[cron] Notion database 同步任務失敗:", error);
        });
      },
      { timezone: "Asia/Taipei" },
    );
  }

  console.log(
    "[cron] LINE 監控排程已啟動（每日 12:00 摘要、10/14/18/22 異常檢查、週一 09:00 週報、每日 12:10 Notion 同步，Asia/Taipei）",
  );

  cronInitialized = true;
}

/**
 * 取得 Cron 初始化狀態（用於測試）
 */
export function isCronInitialized(): boolean {
  return cronInitialized;
}

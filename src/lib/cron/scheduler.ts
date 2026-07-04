import cron from "node-cron";
import { initDynamicScheduler } from "./dynamic-scheduler";
import {
  runDailyDigestForAllUsers,
  runAnomalyCheckForAllUsers,
} from "./monitor-jobs";

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

  // 每日摘要：台北時間 08:30
  cron.schedule(
    "30 8 * * *",
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

  console.log(
    "[cron] LINE 監控排程已啟動（每日 08:30 摘要、10/14/18/22 異常檢查，Asia/Taipei）",
  );

  cronInitialized = true;
}

/**
 * 取得 Cron 初始化狀態（用於測試）
 */
export function isCronInitialized(): boolean {
  return cronInitialized;
}

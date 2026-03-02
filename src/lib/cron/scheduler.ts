import cron from "node-cron";
import { syncToNotion } from "./sync-notion";

// 使用 singleton pattern 確保只初始化一次
let cronInitialized = false;

/**
 * 初始化 Cron Jobs
 * 使用 singleton pattern 確保在 Next.js 環境中只執行一次
 */
export function initCronJobs(): void {
  // 如果已經初始化過，直接返回
  if (cronInitialized) {
    console.log("⏭️  Cron jobs 已經初始化，跳過重複執行");
    return;
  }

  // 檢查是否啟用自動同步
  const enableAutoSync =
    process.env.ENABLE_AUTO_SYNC?.toLowerCase() !== "false";

  if (!enableAutoSync) {
    console.log("⏸️  自動同步已停用 (ENABLE_AUTO_SYNC=false)");
    return;
  }

  // 從環境變數讀取排程時間，預設每天早上 9:00
  const cronSchedule = process.env.CRON_SCHEDULE || "0 9 * * *";

  console.log(`⏰ 正在註冊 Cron Job...`);
  console.log(`   排程時間: ${cronSchedule}`);
  console.log(`   時區: ${process.env.TZ || "UTC"}`);

  // 註冊每日同步任務
  cron.schedule(
    cronSchedule,
    async () => {
      console.log(`\n${"=".repeat(50)}`);
      console.log(`⏰ Cron 任務觸發 - ${new Date().toISOString()}`);
      console.log(`${"=".repeat(50)}\n`);

      await syncToNotion();
    },
    {
      scheduled: true,
      timezone: process.env.TZ || "UTC",
    }
  );

  cronInitialized = true;
  console.log("✅ Cron Job 註冊成功!");
  console.log(`   下次執行時間將根據排程 "${cronSchedule}" 自動執行\n`);
}

/**
 * 取得 Cron 初始化狀態（用於測試）
 */
export function isCronInitialized(): boolean {
  return cronInitialized;
}

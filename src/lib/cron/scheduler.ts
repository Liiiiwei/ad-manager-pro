import { initDynamicScheduler } from './dynamic-scheduler';

// 使用 singleton pattern 確保只初始化一次
let cronInitialized = false;

/**
 * 初始化 Cron Jobs
 * 使用 singleton pattern 確保在 Next.js 環境中只執行一次
 */
export function initCronJobs(): void {
  // 如果已經初始化過，直接返回
  if (cronInitialized) {
    console.log('⏭️  Cron jobs 已經初始化，跳過重複執行');
    return;
  }

  // 初始化動態排程系統（多租戶 SaaS）
  initDynamicScheduler();

  cronInitialized = true;
}

/**
 * 取得 Cron 初始化狀態（用於測試）
 */
export function isCronInitialized(): boolean {
  return cronInitialized;
}

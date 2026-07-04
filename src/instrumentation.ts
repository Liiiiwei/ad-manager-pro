/**
 * Next.js instrumentation hook — 伺服器啟動時初始化 cron 排程
 * 只在 Node.js runtime 執行（避免 edge runtime 載入 node-cron）
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCronJobs } = await import("@/lib/cron/scheduler");
    initCronJobs();
  }
}

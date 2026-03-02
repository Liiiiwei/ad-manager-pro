import cron from 'node-cron';
import { getActiveSchedules } from '@/lib/db/repositories/sync-schedule';
import { executeSyncForUser } from './job-executor';

/**
 * 初始化動態 Cron 排程系統
 * 使用 polling 機制：每小時檢查一次所有使用者的排程
 */
export function initDynamicScheduler(): void {
  const enableAutoSync = process.env.ENABLE_AUTO_SYNC?.toLowerCase() !== 'false';

  if (!enableAutoSync) {
    console.log('⏸️  自動同步已停用 (ENABLE_AUTO_SYNC=false)');
    return;
  }

  console.log('⏰ 正在初始化動態 Cron 排程系統...');

  // 每小時檢查一次是否有使用者需要執行同步
  cron.schedule('0 * * * *', async () => {
    console.log(`\n⏰ [定時檢查] ${new Date().toISOString()}`);
    await checkAndExecuteSchedules();
  });

  // 初始化時也執行一次檢查
  checkAndExecuteSchedules();

  console.log('✅ 動態 Cron 排程系統已啟動（每小時檢查一次）\n');
}

/**
 * 檢查並執行需要同步的排程
 */
async function checkAndExecuteSchedules(): Promise<void> {
  try {
    const schedules = await getActiveSchedules();
    const now = new Date();

    console.log(`📋 檢查 ${schedules.length} 個啟用的排程...`);

    for (const schedule of schedules) {
      // 檢查是否到達執行時間
      if (schedule.nextRunAt && schedule.nextRunAt <= now) {
        console.log(
          `\n🚀 觸發使用者排程: ${schedule.user.email} (${schedule.cronExpression})`
        );

        // 非同步執行（不阻塞其他排程）
        executeSyncForUser(schedule.userId, schedule.id).catch((error) => {
          console.error(`❌ 使用者 ${schedule.user.email} 同步失敗:`, error);
        });
      }
    }
  } catch (error) {
    console.error('❌ 檢查排程失敗:', error);
  }
}

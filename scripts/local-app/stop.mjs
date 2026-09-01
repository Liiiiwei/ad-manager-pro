// 讀 pidfile → 送 SIGTERM 給 start.mjs → 由其乾淨收尾（停 Next、停 Postgres、刪 pidfile）。
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PID_FILE } from './config.mjs';

function notify(msg) {
  spawnSync('osascript', ['-e', `display notification "${msg}" with title "Ad Manager Pro"`], { stdio: 'ignore' });
}

if (!existsSync(PID_FILE)) {
  notify('沒有執行中的服務');
  process.exit(0);
}
const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
if (!pid) { notify('沒有執行中的服務'); process.exit(0); }
try {
  process.kill(pid, 'SIGTERM');
  notify('停止服務中…');
} catch {
  notify('服務未在執行');
}

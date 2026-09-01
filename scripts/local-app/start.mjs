// 生命週期管家：起 embedded Postgres → prisma db push → next start → 開瀏覽器；
// 攔截關閉訊號乾淨收尾（先停 Next 再停 Postgres）。
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import {
  PROJECT_ROOT, DB_DIR, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE,
  NEXT_PORT, ENV_LOCAL, PID_FILE, NEXT_BUILD_DIR,
  isDbInitialised, parseEnvFile, buildChildEnv,
} from './config.mjs';

const NEXT_URL = `http://localhost:${NEXT_PORT}`;
const DASHBOARD_URL = `${NEXT_URL}/dashboard`;
const PRISMA_BIN = join(PROJECT_ROOT, 'node_modules/.bin/prisma');
const NEXT_BIN = join(PROJECT_ROOT, 'node_modules/.bin/next');

function notify(msg) {
  spawnSync('osascript', ['-e', `display notification "${msg}" with title "Ad Manager Pro"`], { stdio: 'ignore' });
}
function log(msg) { console.log(`[start] ${msg}`); }

// 已在執行中？（pidfile 存在且該 pid 仍活著）
function alreadyRunning() {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// 輪詢等 Next 回應
async function waitForPort(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(url, { method: 'HEAD' }); return true; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  return false;
}

async function main() {
  // 已在跑 → 只開瀏覽器
  if (alreadyRunning()) {
    log('服務已在執行，開啟瀏覽器');
    spawn('open', [DASHBOARD_URL], { stdio: 'ignore', detached: true });
    return;
  }

  // 首次：缺 build 或缺 .env.local → 先跑 setup
  if (!existsSync(NEXT_BUILD_DIR) || !existsSync(ENV_LOCAL)) {
    notify('首次設定中，請稍候…');
    const r = spawnSync(process.execPath, [join(PROJECT_ROOT, 'scripts/local-app/setup.mjs')], {
      cwd: PROJECT_ROOT, stdio: 'inherit',
    });
    if (r.status !== 0) { notify('首次設定失敗，請看 log'); process.exit(1); }
  }

  const envLocal = parseEnvFile(readFileSync(ENV_LOCAL, 'utf8'));
  const childEnv = buildChildEnv(process.env, envLocal);

  // 1. 內嵌 Postgres（initialise 不冪等，用 PG_VERSION 判斷）
  notify('啟動資料庫…');
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    onLog: () => {},
    onError: (m) => console.error('[pg]', m),
  });
  const fresh = !isDbInitialised(DB_DIR);
  if (fresh) { log('初始化資料庫目錄…'); await pg.initialise(); }
  await pg.start();
  if (fresh) { log('建立資料庫…'); await pg.createDatabase(PG_DATABASE); }

  // 2. 套用 schema（db push；安裝的 Prisma 7.8.0 db push 不支援 --skip-generate，故不傳）
  log('套用資料庫結構（prisma db push）…');
  const push = spawnSync(PRISMA_BIN, ['db', 'push'], {
    cwd: PROJECT_ROOT, env: childEnv, stdio: 'inherit',
  });
  if (push.status !== 0) { await pg.stop(); notify('資料庫初始化失敗'); process.exit(1); }

  // 3. 啟動 Next 正式伺服器
  notify('啟動應用…');
  const next = spawn(NEXT_BIN, ['start', '-p', String(NEXT_PORT)], {
    cwd: PROJECT_ROOT, env: childEnv, stdio: 'inherit',
  });

  // 4. 收尾（先停 Next 再停 Postgres，刪 pidfile）
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log('關閉中…');
    try { next.kill('SIGTERM'); } catch {}
    try { await pg.stop(); } catch {}
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  next.on('exit', shutdown); // Next 掛掉就一起收
  next.on('error', shutdown); // spawn 失敗（找不到執行檔／權限）只發 error 不發 exit，一樣要收尾

  // 5. pidfile、等埠通、開瀏覽器
  writeFileSync(PID_FILE, String(process.pid));
  const ready = await waitForPort(NEXT_URL, 60000);
  if (ready) {
    notify('已就緒');
    spawn('open', [DASHBOARD_URL], { stdio: 'ignore', detached: true });
  } else {
    notify('啟動逾時，請看 log');
  }
}

main().catch((err) => {
  console.error(err);
  notify('啟動失敗，請看 log');
  process.exit(1);
});

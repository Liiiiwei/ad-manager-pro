# 原生本機 Mac App 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把專案做成「雙擊 `AdManagerPro.app` 約 3–8 秒開瀏覽器」的本機 Mac App，用原生 Node + 內嵌 Postgres 取代 Docker，不打包成單一執行檔。

**Architecture:** 沿用現有 `.app` 外殼（Finder 雙擊），把 launcher 內容從 Docker 換成「定位 node → 執行 Node 腳本」。核心是 `scripts/local-app/start.mjs`：用 `embedded-postgres` 起本機 Postgres → `prisma db push` → `next start`（已 build 的正式版）→ 等埠通後開瀏覽器；攔截關閉訊號乾淨收尾。首次自動跑 `setup.mjs`（產金鑰、build）。

**Tech Stack:** Node 20+（ESM `.mjs`）、`embedded-postgres`、既有 Next.js 16 / Prisma 7（`@prisma/adapter-pg`）、Vitest、bash `.app` launcher、macOS `osascript` 通知。

## Global Constraints

- Node 20+；本機 App 腳本一律 ESM `.mjs`。
- 埠：Next `3000`、內嵌 Postgres `5433`（避開系統預設 5432）。
- **build 不連 DB**：`app:build = prisma generate && next build`；`prisma db push` 只在「啟動時」做，不在 build 時做。
- 免登入沿用既有 `LOCAL_NO_AUTH=true`，不改 Clerk、不改 middleware。
- **Prisma schema 完全不動**（維持 `provider = "postgresql"`）。
- 程式碼與 log 註解一律繁體中文。
- `embedded-postgres` 放 `devDependencies`；安裝時**勿加** `--ignore-scripts`（平台二進位靠 postinstall 安裝）。
- 內嵌 Postgres 初始化方法 `initialise()`（英式拼法）**不冪等**：資料目錄已存在會丟錯，必須先用 `PG_VERSION` 檔判斷是否已初始化。`createDatabase()` 同理，DB 已存在會丟錯。
- 既有 282 個測試須維持綠燈（schema 與引擎皆不變，不應受影響）。

---

## File Structure

**Create:**
- `scripts/local-app/config.mjs` — 共用常數與純函式（路徑、埠、DB 設定、URL/金鑰/env 檔的純函式）。可單元測試。
- `scripts/local-app/setup.mjs` — 首次設定（冪等）：寫 `.env.local`、`npm ci`、`app:build`。
- `scripts/local-app/start.mjs` — 生命週期管家：起 pg → db push → next → 開瀏覽器 → 收尾。
- `scripts/local-app/stop.mjs` — 讀 pidfile → SIGTERM。
- `scripts/local-app/find-node.sh` — 定位 node 並把其目錄加進 PATH（解 Finder PATH 陷阱）。
- `scripts/local-app/__tests__/config.test.ts` — config 純函式測試。
- `AdManagerPro-Rebuild.app/Contents/{Info.plist,MacOS/launcher,Resources/icon.icns}` — 重建動作 .app。

**Modify:**
- `AdManagerPro.app/Contents/MacOS/launcher` — Docker → 原生。
- `AdManagerPro-Stop.app/Contents/MacOS/launcher` — Docker → 原生。
- `package.json` — 加 `embedded-postgres` devDep 與 `app:*` scripts。
- `.gitignore` — 加 `.local-db/`、`.local-app.pid`、`.local-app.log`。
- `docker/README.md` — 標註原生為預設、Docker 改為進階選項。

---

## Task 1: 相依套件、gitignore 與 config 純函式模組

**Files:**
- Modify: `package.json`（devDependencies）
- Modify: `.gitignore`
- Create: `scripts/local-app/config.mjs`
- Test: `scripts/local-app/__tests__/config.test.ts`

**Interfaces:**
- Produces（供後續所有任務使用）：常數 `PROJECT_ROOT, NEXT_PORT=3000, PG_PORT=5433, PG_USER, PG_PASSWORD, PG_DATABASE, DB_DIR, ENV_LOCAL, PID_FILE, LOG_FILE, NODE_MODULES, NEXT_BUILD_DIR`；純函式 `buildDatabaseUrl(opts?) -> string`、`generateEncryptionKey() -> string`、`isDbInitialised(dbDir?) -> boolean`、`parseEnvFile(text) -> object`、`serializeEnvFile(obj) -> string`、`buildEnvLocalContent(existingText?, {encryptionKey?}) -> string`、`buildChildEnv(baseEnv, envLocal) -> object`。

- [ ] **Step 1: 安裝 embedded-postgres（devDependency）**

Run:
```bash
npm install --save-dev embedded-postgres
```
Expected: `package.json` 的 `devDependencies` 新增 `embedded-postgres`，`node_modules/@embedded-postgres/darwin-arm64` 存在（平台二進位）。**勿**加 `--ignore-scripts`。

- [ ] **Step 2: 加入 .gitignore 條目**

在 `.gitignore` 末尾新增（`.env*.local` 已存在、不需重複）：
```
# 本機 App（原生啟動器）
.local-db/
.local-app.pid
.local-app.log
```

- [ ] **Step 3: 寫 config.mjs（純函式 + 常數）**

Create `scripts/local-app/config.mjs`：
```js
// 本機 App 啟動系統的共用常數與純函式（可單元測試，無副作用）。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';

// 專案根目錄：本檔位於 scripts/local-app/ 之下，往上兩層即 repo 根目錄
const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..', '..');

// 埠與資料庫設定
export const NEXT_PORT = 3000;
export const PG_PORT = 5433; // 避開系統預設 5432
export const PG_USER = 'postgres';
export const PG_PASSWORD = 'postgres';
export const PG_DATABASE = 'ad_manager_pro';

// 本機檔案路徑
export const DB_DIR = join(PROJECT_ROOT, '.local-db');
export const ENV_LOCAL = join(PROJECT_ROOT, '.env.local');
export const PID_FILE = join(PROJECT_ROOT, '.local-app.pid');
export const LOG_FILE = join(PROJECT_ROOT, '.local-app.log');
export const NODE_MODULES = join(PROJECT_ROOT, 'node_modules');
export const NEXT_BUILD_DIR = join(PROJECT_ROOT, '.next');

// 組出 Next 用的資料庫連線字串（embedded-postgres 無 getConnectionUri，須自組）
export function buildDatabaseUrl({
  host = 'localhost',
  port = PG_PORT,
  user = PG_USER,
  password = PG_PASSWORD,
  database = PG_DATABASE,
} = {}) {
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}

// 產生 64 字元 hex 的加密金鑰（AES-256-GCM 用）
export function generateEncryptionKey() {
  return randomBytes(32).toString('hex');
}

// 判斷 embedded Postgres 資料目錄是否已初始化（有 PG_VERSION 檔即為已初始化）
export function isDbInitialised(dbDir = DB_DIR) {
  return existsSync(join(dbDir, 'PG_VERSION'));
}

// 解析 .env 檔字串為物件（忽略註解與空行）
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

// 將物件序列化為 .env 檔字串
export function serializeEnvFile(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

// 依現有 .env.local 內容計算要寫入的內容：
// 保留既有 ENCRYPTION_KEY（避免重開後解不開舊加密資料），其餘用本機固定值。
export function buildEnvLocalContent(existingText = '', { encryptionKey } = {}) {
  const existing = parseEnvFile(existingText);
  const key = existing.ENCRYPTION_KEY || encryptionKey || generateEncryptionKey();
  const merged = {
    DATABASE_URL: buildDatabaseUrl(),
    NODE_ENV: 'production',
    LOCAL_NO_AUTH: 'true',
    ENCRYPTION_KEY: key,
    ENABLE_AUTO_SYNC: 'false',
    ENABLE_LINE_CRON: 'false',
    NEXT_PUBLIC_APP_URL: `http://localhost:${NEXT_PORT}`,
  };
  return serializeEnvFile(merged);
}

// 依 .env.local 物件組出要傳給子程序的環境變數
export function buildChildEnv(baseEnv, envLocal) {
  return { ...baseEnv, ...envLocal };
}
```

- [ ] **Step 4: 寫 config 測試**

Create `scripts/local-app/__tests__/config.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDatabaseUrl, generateEncryptionKey, isDbInitialised,
  parseEnvFile, serializeEnvFile, buildEnvLocalContent, buildChildEnv,
} from '../config.mjs';

describe('buildDatabaseUrl', () => {
  it('組出預設本機連線字串（埠 5433）', () => {
    expect(buildDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@localhost:5433/ad_manager_pro?schema=public',
    );
  });
});

describe('generateEncryptionKey', () => {
  it('回傳 64 字元 hex', () => {
    expect(generateEncryptionKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isDbInitialised', () => {
  it('目錄有 PG_VERSION 才判為已初始化', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-'));
    expect(isDbInitialised(dir)).toBe(false);
    writeFileSync(join(dir, 'PG_VERSION'), '16');
    expect(isDbInitialised(dir)).toBe(true);
  });
});

describe('parseEnvFile / serializeEnvFile', () => {
  it('忽略註解與空行', () => {
    expect(parseEnvFile('# 註解\n\nA=1\nB=two\n')).toEqual({ A: '1', B: 'two' });
  });
  it('round-trip 一致', () => {
    expect(parseEnvFile(serializeEnvFile({ A: '1', B: '2' }))).toEqual({ A: '1', B: '2' });
  });
});

describe('buildEnvLocalContent', () => {
  it('沒有既有金鑰時產生一組並帶入本機固定值', () => {
    const parsed = parseEnvFile(buildEnvLocalContent('', {}));
    expect(parsed.ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.LOCAL_NO_AUTH).toBe('true');
    expect(parsed.ENABLE_LINE_CRON).toBe('false');
    expect(parsed.DATABASE_URL).toContain('5433');
  });
  it('保留既有 ENCRYPTION_KEY（冪等，重跑不換金鑰）', () => {
    const first = buildEnvLocalContent('', {});
    const key = parseEnvFile(first).ENCRYPTION_KEY;
    const second = buildEnvLocalContent(first, {});
    expect(parseEnvFile(second).ENCRYPTION_KEY).toBe(key);
  });
});

describe('buildChildEnv', () => {
  it('用 envLocal 覆蓋 base', () => {
    expect(buildChildEnv({ A: '1', B: '2' }, { B: 'x', C: 'y' })).toEqual({ A: '1', B: 'x', C: 'y' });
  });
});
```

- [ ] **Step 5: 跑測試確認通過**

Run:
```bash
npx vitest run scripts/local-app/__tests__/config.test.ts
```
Expected: PASS（8 個測試全綠）。

- [ ] **Step 6: 確認既有測試未受影響**

Run:
```bash
npm test
```
Expected: 既有 282 測試 + 新增 config 測試皆 PASS。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/local-app/config.mjs scripts/local-app/__tests__/config.test.ts
git commit -m "feat(local-app): 加入 embedded-postgres 與 config 純函式模組"
```

---

## Task 2: setup.mjs（首次設定，冪等）

**Files:**
- Create: `scripts/local-app/setup.mjs`
- Modify: `package.json`（scripts）

**Interfaces:**
- Consumes: `config.mjs` 的 `ENV_LOCAL, NODE_MODULES, NEXT_BUILD_DIR, PROJECT_ROOT, buildEnvLocalContent`。
- Produces: 可執行 `node scripts/local-app/setup.mjs [--rebuild]`；npm scripts `app:build`、`app:setup`、`app:rebuild`。副作用：寫 `.env.local`、（缺 node_modules 時）`npm ci`、產生 `.next`。

- [ ] **Step 1: 加入 package.json scripts**

在 `package.json` 的 `scripts` 內新增（保留既有 script）：
```json
"app:build": "prisma generate && next build",
"app:setup": "node scripts/local-app/setup.mjs",
"app:start": "node scripts/local-app/start.mjs",
"app:stop": "node scripts/local-app/stop.mjs",
"app:rebuild": "node scripts/local-app/setup.mjs --rebuild"
```
（`app:start`、`app:stop` 會在 Task 3、4 用到，這裡一併加入。）

- [ ] **Step 2: 寫 setup.mjs**

Create `scripts/local-app/setup.mjs`：
```js
// 首次設定（冪等）：確保 .env.local、相依套件、正式 build 就緒。
// 用 --rebuild 強制重新 build（供「重建動作」使用）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  ENV_LOCAL, NODE_MODULES, NEXT_BUILD_DIR, PROJECT_ROOT, buildEnvLocalContent,
} from './config.mjs';

// 寫 .env.local：保留既有金鑰、補齊本機固定值
function ensureEnvLocal() {
  const existing = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : '';
  writeFileSync(ENV_LOCAL, buildEnvLocalContent(existing, {}));
  console.log('[setup] .env.local 就緒');
}

// 缺 node_modules 才安裝
function ensureDeps() {
  if (existsSync(NODE_MODULES)) {
    console.log('[setup] node_modules 已存在，跳過安裝');
    return;
  }
  console.log('[setup] 安裝相依套件（npm ci）…');
  const r = spawnSync('npm', ['ci'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('npm ci 失敗');
}

// build 正式版（不連 DB）；force 時即使 .next 已存在也重建
function ensureBuild({ force = false } = {}) {
  if (!force && existsSync(NEXT_BUILD_DIR)) {
    console.log('[setup] .next 已存在，跳過 build（如需更新請用重建）');
    return;
  }
  console.log('[setup] 建置正式版（prisma generate && next build，不連 DB）…');
  const r = spawnSync('npm', ['run', 'app:build'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('build 失敗');
}

const force = process.argv.includes('--rebuild');
ensureEnvLocal();
ensureDeps();
ensureBuild({ force });
console.log('[setup] 完成');
```

（`npm` 可用性：實際透過 `.app` 啟動時，`find-node.sh` 會把 node 的目錄加進 PATH，npm 與 node 同目錄故可用；直接用 CLI 執行時 PATH 本就有 npm。）

- [ ] **Step 3: 執行 setup 並驗證 .env.local**

Run:
```bash
node scripts/local-app/setup.mjs
```
Expected: 印出「.env.local 就緒 / …/ 完成」；首次會跑 `next build`（含下載 embedded-postgres 二進位可能已於 Task 1 完成），可能數分鐘。

驗證 `.env.local`：
```bash
grep -E 'LOCAL_NO_AUTH|DATABASE_URL|ENCRYPTION_KEY' .env.local
```
Expected: 三行都在；`DATABASE_URL` 含 `5433`、`LOCAL_NO_AUTH=true`、`ENCRYPTION_KEY` 為 64 hex。

- [ ] **Step 4: 驗證冪等（重跑不換金鑰、不重複 build）**

Run:
```bash
KEY_BEFORE=$(grep ENCRYPTION_KEY .env.local); node scripts/local-app/setup.mjs; KEY_AFTER=$(grep ENCRYPTION_KEY .env.local); [ "$KEY_BEFORE" = "$KEY_AFTER" ] && echo IDEMPOTENT_OK
```
Expected: 印出 `IDEMPOTENT_OK`，且 `.next` 那步印「跳過 build」。

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/local-app/setup.mjs
git commit -m "feat(local-app): 首次設定腳本 setup.mjs（產金鑰、build，冪等）"
```

---

## Task 3: start.mjs（起 Postgres + Next + 開瀏覽器 + 收尾）

**Files:**
- Create: `scripts/local-app/start.mjs`

**Interfaces:**
- Consumes: `config.mjs` 全部匯出；`embedded-postgres` 預設匯出；node 內建 `fetch`。
- Produces: 可執行 `node scripts/local-app/start.mjs`。行為：起內嵌 pg（初始化用 `PG_VERSION` 判斷冪等）→ `prisma db push --skip-generate` → `next start -p 3000` → 寫 `.local-app.pid` → 等埠通 → `open /dashboard`；`SIGTERM/SIGINT` 或 Next 退出時先停 Next 再 `pg.stop()`、刪 pidfile。已在執行則只開瀏覽器後結束。

- [ ] **Step 1: 寫 start.mjs**

Create `scripts/local-app/start.mjs`：
```js
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

  // 2. 套用 schema（db push，不重新 generate）
  log('套用資料庫結構（prisma db push）…');
  const push = spawnSync(PRISMA_BIN, ['db', 'push', '--skip-generate'], {
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
```

- [ ] **Step 2: 冷啟動端到端驗證（首次含 build，較慢）**

先確保已 build（Task 2 已做）。在背景啟動並等就緒：
```bash
node scripts/local-app/start.mjs >> .local-app.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/dashboard && break; sleep 2; done
curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dashboard
```
Expected: 印出 `HTTP 200`（免登入放行故不被導去登入）。

驗證 Postgres 有在跑、pidfile 有寫：
```bash
pg_lsclusters 2>/dev/null; lsof -iTCP:5433 -sTCP:LISTEN -n -P | head; cat .local-app.pid
```
Expected: `5433` 有 postgres 在監聽；`.local-app.pid` 有一個數字。

- [ ] **Step 3: 熱啟動再測一次（模擬第二次雙擊 → 只開瀏覽器）**

Run:
```bash
node scripts/local-app/start.mjs
```
Expected: 因 pidfile 仍在且程序活著，印「服務已在執行，開啟瀏覽器」後立即結束（不重複起 pg/next）。

- [ ] **Step 4: 手動收尾（供下一個 Task 前清場）**

Run:
```bash
kill -TERM "$(cat .local-app.pid)" 2>/dev/null; sleep 3; lsof -iTCP:5433 -sTCP:LISTEN -n -P | head
```
Expected: SIGTERM 後 `5433` 不再有監聽（Postgres 已停）、`.local-app.pid` 被刪除。

- [ ] **Step 5: Commit**

```bash
git add scripts/local-app/start.mjs
git commit -m "feat(local-app): start.mjs 起 Postgres+Next+開瀏覽器與訊號收尾"
```

---

## Task 4: stop.mjs（停止服務）

**Files:**
- Create: `scripts/local-app/stop.mjs`

**Interfaces:**
- Consumes: `config.mjs` 的 `PID_FILE`。
- Produces: 可執行 `node scripts/local-app/stop.mjs`；讀 pidfile 送 SIGTERM 給 `start.mjs`，由其乾淨收尾。

- [ ] **Step 1: 寫 stop.mjs**

Create `scripts/local-app/stop.mjs`：
```js
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
```

- [ ] **Step 2: 驗證 start → stop 全流程**

Run:
```bash
node scripts/local-app/start.mjs >> .local-app.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/dashboard && break; sleep 2; done
node scripts/local-app/stop.mjs
sleep 3
echo "port5433:"; lsof -iTCP:5433 -sTCP:LISTEN -n -P | head
echo "port3000:"; lsof -iTCP:3000 -sTCP:LISTEN -n -P | head
echo "pidfile:"; [ -f .local-app.pid ] && echo EXISTS || echo GONE
```
Expected: `stop.mjs` 送出 SIGTERM 後，3000 與 5433 皆無監聽、pidfile 顯示 `GONE`。

- [ ] **Step 3: 驗證未啟動時 stop 不報錯**

Run:
```bash
node scripts/local-app/stop.mjs; echo "exit=$?"
```
Expected: 顯示通知「沒有執行中的服務」，`exit=0`。

- [ ] **Step 4: Commit**

```bash
git add scripts/local-app/stop.mjs
git commit -m "feat(local-app): stop.mjs 依 pidfile 送 SIGTERM 停止服務"
```

---

## Task 5: find-node.sh 與改寫 Start / Stop 的 .app launcher（原生）

**Files:**
- Create: `scripts/local-app/find-node.sh`
- Modify: `AdManagerPro.app/Contents/MacOS/launcher`
- Modify: `AdManagerPro-Stop.app/Contents/MacOS/launcher`

**Interfaces:**
- Produces: `find-node.sh`（被 source 後設好 `NODE` 變數並把其目錄加進 `PATH`，找不到 node 則跳 alert 並 `exit 1`）；兩個 .app launcher 改為「定位 node → exec 對應 Node 腳本」。

- [ ] **Step 1: 寫 find-node.sh**

Create `scripts/local-app/find-node.sh`：
```bash
#!/bin/bash
# 定位 node 並把它的目錄加進 PATH（讓 npm/npx 一起可用）。
# 解決 Finder 雙擊 .app 不繼承使用者 shell PATH 的問題。
# 用法：source 本檔。成功後 $NODE 指向 node，PATH 已含其目錄；失敗則跳 alert 並 exit 1。

find_node() {
  # 1. 現有 PATH
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  # 2. 常見安裝路徑
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
  # 3. nvm 目前版本
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
    command -v node >/dev/null 2>&1 && { command -v node; return; }
  fi
  # 4. 用登入 shell 解析（涵蓋自訂 PATH 設定）
  local viashell
  viashell="$("$SHELL" -lc 'command -v node' 2>/dev/null)"
  [ -n "$viashell" ] && { echo "$viashell"; return; }
}

NODE="$(find_node)"
if [ -z "$NODE" ]; then
  osascript -e 'display alert "找不到 Node.js" message "請先安裝 Node.js 20 以上版本（例如 Homebrew：brew install node），再重新開啟 Ad Manager Pro。"' >/dev/null 2>&1
  exit 1
fi
export NODE
export PATH="$(dirname "$NODE"):$PATH"
```

- [ ] **Step 2: 改寫 AdManagerPro.app 的 launcher（Start）**

覆蓋 `AdManagerPro.app/Contents/MacOS/launcher` 全文：
```bash
#!/bin/bash
# Ad Manager Pro 啟動器（原生版）：定位 node → 執行 start.mjs。
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/local-app/find-node.sh"
cd "$PROJECT_DIR"
exec "$NODE" scripts/local-app/start.mjs
```

- [ ] **Step 3: 改寫 AdManagerPro-Stop.app 的 launcher（Stop）**

覆蓋 `AdManagerPro-Stop.app/Contents/MacOS/launcher` 全文：
```bash
#!/bin/bash
# Ad Manager Pro 停止器（原生版）：定位 node → 執行 stop.mjs。
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/local-app/find-node.sh"
cd "$PROJECT_DIR"
exec "$NODE" scripts/local-app/stop.mjs
```

- [ ] **Step 4: 設定可執行權限**

Run:
```bash
chmod +x scripts/local-app/find-node.sh \
  "AdManagerPro.app/Contents/MacOS/launcher" \
  "AdManagerPro-Stop.app/Contents/MacOS/launcher"
```
Expected: 無輸出、exit 0。

- [ ] **Step 5: 模擬 Finder 精簡 PATH 驗證 node 定位**

用最小 PATH（模擬 Finder 啟動）跑 Start launcher，確認仍能找到 node 並啟動：
```bash
env -i HOME="$HOME" SHELL="$SHELL" PATH="/usr/bin:/bin" \
  "./AdManagerPro.app/Contents/MacOS/launcher" >> .local-app.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/dashboard && break; sleep 2; done
curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dashboard
```
Expected: `HTTP 200`（證明 `find-node.sh` 在精簡 PATH 下仍定位到 node）。

- [ ] **Step 6: 用 Stop launcher 收場並驗證**

Run:
```bash
env -i HOME="$HOME" SHELL="$SHELL" PATH="/usr/bin:/bin" \
  "./AdManagerPro-Stop.app/Contents/MacOS/launcher"
sleep 3
lsof -iTCP:3000 -sTCP:LISTEN -n -P | head; lsof -iTCP:5433 -sTCP:LISTEN -n -P | head
```
Expected: 3000 與 5433 皆無監聽。

- [ ] **Step 7: Commit**

```bash
git add scripts/local-app/find-node.sh "AdManagerPro.app/Contents/MacOS/launcher" "AdManagerPro-Stop.app/Contents/MacOS/launcher"
git commit -m "feat(local-app): .app launcher 改原生（find-node.sh 解 Finder PATH 陷阱）"
```

---

## Task 6: AdManagerPro-Rebuild.app 與文件

**Files:**
- Create: `AdManagerPro-Rebuild.app/Contents/Info.plist`
- Create: `AdManagerPro-Rebuild.app/Contents/MacOS/launcher`
- Create: `AdManagerPro-Rebuild.app/Contents/Resources/icon.icns`（複製）
- Modify: `docker/README.md`

**Interfaces:**
- Consumes: `find-node.sh`、`setup.mjs --rebuild`。
- Produces: 雙擊即重新 build 的 `.app`；文件標註原生為預設。

- [ ] **Step 1: 建立 Rebuild.app 目錄與 Info.plist**

Run:
```bash
mkdir -p "AdManagerPro-Rebuild.app/Contents/MacOS" "AdManagerPro-Rebuild.app/Contents/Resources"
cp "AdManagerPro.app/Contents/Resources/icon.icns" "AdManagerPro-Rebuild.app/Contents/Resources/icon.icns"
```

Create `AdManagerPro-Rebuild.app/Contents/Info.plist`：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Ad Manager Pro 重建</string>
  <key>CFBundleDisplayName</key><string>Ad Manager Pro 重建</string>
  <key>CFBundleIdentifier</key><string>com.liweisia.admanagerpro.rebuild</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
```

- [ ] **Step 2: 寫 Rebuild launcher**

Create `AdManagerPro-Rebuild.app/Contents/MacOS/launcher`：
```bash
#!/bin/bash
# Ad Manager Pro 重建器：重新 build 讓 App 反映最新程式碼。完成後請重開 App。
set -e
PROJECT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck disable=SC1091
source "$PROJECT_DIR/scripts/local-app/find-node.sh"
cd "$PROJECT_DIR"
osascript -e 'display notification "重建中，完成後請重新開啟 App" with title "Ad Manager Pro"' >/dev/null 2>&1 || true
"$NODE" scripts/local-app/setup.mjs --rebuild
osascript -e 'display notification "重建完成，請重新開啟 Ad Manager Pro" with title "Ad Manager Pro"' >/dev/null 2>&1 || true
```

- [ ] **Step 3: 設定權限**

Run:
```bash
chmod +x "AdManagerPro-Rebuild.app/Contents/MacOS/launcher"
```

- [ ] **Step 4: 驗證重建動作（改碼 → 重建 → 反映）**

Run（用最小 PATH 模擬 Finder；先記錄 build 產物時間戳，重建後應更新）：
```bash
BEFORE=$(stat -f %m .next/BUILD_ID 2>/dev/null || echo 0)
env -i HOME="$HOME" SHELL="$SHELL" PATH="/usr/bin:/bin" \
  "./AdManagerPro-Rebuild.app/Contents/MacOS/launcher"
AFTER=$(stat -f %m .next/BUILD_ID 2>/dev/null || echo 0)
[ "$AFTER" -gt "$BEFORE" ] && echo REBUILD_OK || echo REBUILD_NOCHANGE
```
Expected: 印 `REBUILD_OK`（`.next/BUILD_ID` 時間戳更新，代表確實重跑 build）。

- [ ] **Step 5: 更新 docker/README.md 標註原生為預設**

在 `docker/README.md` 最上方加入一段（保留原 Docker 說明於其後）：
```markdown
> ⚡ 預設用法已改為「原生本機 App」：雙擊 `AdManagerPro.app` 即可（首次會自動設定與 build）。
> 改了程式碼要更新畫面 → 雙擊 `AdManagerPro-Rebuild.app`。停止 → 雙擊 `AdManagerPro-Stop.app`。
> 需要 Node.js 20+（`brew install node`）。以下 Docker 內容改為進階/備援選項。
```

- [ ] **Step 6: 最終回歸測試**

Run:
```bash
npm test
```
Expected: 全綠（既有 282 + config 測試）。

- [ ] **Step 7: Commit**

```bash
git add "AdManagerPro-Rebuild.app" docker/README.md
git commit -m "feat(local-app): 重建動作 .app 與文件（原生為預設）"
```

---

## Self-Review（寫計畫後對照 spec 的自我檢查）

**1. Spec 覆蓋**
- 原生取代 Docker launcher → Task 5。
- 內嵌 Postgres（冪等初始化、自組 URL）→ Task 3（`config.isDbInitialised` + start.mjs）。
- 沿用 `LOCAL_NO_AUTH` 免登入 → `.env.local`（Task 1 config、Task 2 setup）。
- 手動重建動作 → Task 6（Rebuild.app）+ `app:rebuild`（Task 2）。
- 首次 vs 熱啟動兩路徑 → Task 3 Step 2/3。
- 錯誤/狀態（找不到 node、埠、逾時、通知）→ Task 5 find-node.sh、Task 3 notify/waitForPort。
- Finder PATH 陷阱 → Task 5 find-node.sh + Step 5 精簡 PATH 驗證。
- 收尾乾淨（先 Next 後 pg、刪 pidfile）→ Task 3 shutdown、Task 4 stop.mjs。
- build 不連 DB → `app:build`（Task 2）不含 `db push`；`db push` 在 start.mjs。
- gitignore（.local-db/、pid、log；.env.local 已含）→ Task 1 Step 2。
- 已知限制（背景排程只在開著時跑）→ 由 `.env.local` 的 `ENABLE_AUTO_SYNC=false`、`ENABLE_LINE_CRON=false` 落實；本機本就不常駐。
- 既有 282 測試維持 → Task 1 Step 6、Task 6 Step 6。

**2. Placeholder 掃描**：無 TBD/TODO；每個 code step 都有完整程式碼與確切指令、預期輸出。

**3. 型別/命名一致**：`config.mjs` 匯出的常數與函式名在 setup/start/stop 引用處一致（`isDbInitialised`、`buildChildEnv`、`buildEnvLocalContent`、`PID_FILE`、`NEXT_BUILD_DIR` 等）；`initialise()`（英式）依套件實況；pidfile 一律 `.local-app.pid`。

**已知邊界（非 placeholder，明列供實作者知情）**
- 若日後升級 `embedded-postgres` 主版本導致 Postgres 大版本改變，`.local-db` 的 `PG_VERSION` 會不符使 `pg.start()` 失敗；處置：刪 `.local-db`（本機資料可再同步取得）後重開。
- `next build` 理論上不連 DB（既有 Docker 已於 build 期不連 DB 成功）。若某路由在 build 期做 DB 存取導致失敗，於該路由加 `export const dynamic = 'force-dynamic'`；依現況不預期發生。

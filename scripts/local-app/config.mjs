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

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

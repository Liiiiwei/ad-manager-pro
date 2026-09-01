# 本機 Docker「雙擊即用」app 捷徑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者雙擊一個 macOS app 圖示，就能在本機 Docker 把 Ad Manager Pro（含 Postgres）完整跑起來、免登入直接進 dashboard。

**Architecture:** 沿用專案既有單階段 `Dockerfile`（`node:22` + `next start`），用 `docker-compose.yml` 把 app 與 `postgres:16-alpine` 綁在一起、資料存 named volume。免登入採「方案 A」：production build + 一個預設關閉的 `LOCAL_NO_AUTH` 旗標，透過共用純函式 `isAuthBypassEnabled()` 讓 middleware 與 `getCurrentUser()` 在本機放行 dev fallback user；同時對 Clerk 前端（`ClerkProvider`、`UserButton`）加條件式渲染，避免無 publishable key 時 render 拋錯。最外層是一個 macOS `.app` bundle，其 launcher shell 腳本負責啟動 Docker → `docker compose up` → 開瀏覽器。

**Tech Stack:** Next.js 16 / React 19 / TypeScript、Prisma 7（`@prisma/adapter-pg`）、Clerk v7、Vitest、Docker / docker-compose、macOS `.app` bundle（Info.plist + shell launcher + `.icns`）。

## Global Constraints

- 所有文件、註解、README、通知文字一律**繁體中文**；不混日文／簡體／英文（React、Docker、Clerk、Prisma 等技術專有名詞保留原文不算違規）。
- `LOCAL_NO_AUTH` 旗標**預設不存在**：Zeabur 正式站不設此旗標，行為必須與現在完全相同（未設金鑰 + `NODE_ENV=production` → middleware 仍回 503）。
- `docker/.env.docker`（含 `ENCRYPTION_KEY`）**絕不進 git**；只提供 `docker/.env.docker.example` 範本。
- Docker image **不得**含 host 的 `.env`（避免把正式 Clerk 金鑰內聯進本機 image，會翻成登入模式）——靠 `.dockerignore` 排除。
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 由 Next.js 於 **build 期內聯**：本機 image build 不帶此 key → 恆走無 Clerk 路徑；Zeabur build 帶 key → 恆走 ClerkProvider 路徑。
- UI 顏色一律用 token（`bg-accent`、`text-muted`…），禁止硬寫色票（見 `DESIGN.md`）。
- 刪檔一律用 `trash` CLI 或 `mv` 到 `~/.Trash`，禁用 `rm -rf`。
- 每個 task 的需求隱含包含本節全部條款。

**設計來源：** `docs/superpowers/specs/2026-09-01-docker-local-app-design.md`（方案 A，已核准）。

---

### Task 1: `isAuthBypassEnabled()` 共用純函式

免登入的判斷邏輯（「非 production 或 `LOCAL_NO_AUTH==="true"`」）會被 middleware 與 `getCurrentUser()` 共用。先抽成一個零依賴純函式並以單元測試鎖定三種情境，後續 Task 2 才接線。

**Files:**
- Create: `src/lib/auth/env.ts`
- Test: `src/lib/auth/__tests__/env.test.ts`

**Interfaces:**
- Consumes: 無（只讀 `process.env`）。
- Produces: `export function isAuthBypassEnabled(): boolean` — Task 2 的 `middleware.ts`、`clerk.ts` 會 import 使用。

- [ ] **Step 1: 寫失敗測試**

`src/lib/auth/__tests__/env.test.ts`：

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { isAuthBypassEnabled } from "../env";

describe("isAuthBypassEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("開發環境（NODE_ENV=development）回 true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_NO_AUTH", "");
    expect(isAuthBypassEnabled()).toBe(true);
  });

  it("production 且未設 LOCAL_NO_AUTH：回 false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "");
    expect(isAuthBypassEnabled()).toBe(false);
  });

  it("production 但 LOCAL_NO_AUTH=true：回 true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "true");
    expect(isAuthBypassEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/auth/__tests__/env.test.ts`
Expected: FAIL，訊息類似 `Failed to resolve import "../env"` 或 `isAuthBypassEnabled is not a function`。

- [ ] **Step 3: 寫最小實作**

`src/lib/auth/env.ts`：

```ts
/**
 * 是否啟用「免驗證」放行（本機／開發用）。
 *
 * 條件：非 production，或明確設定 LOCAL_NO_AUTH="true"（本機 Docker 用）。
 * 正式站（NODE_ENV=production 且未設此旗標）一律回 false，確保安全。
 */
export function isAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.LOCAL_NO_AUTH === "true"
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/auth/__tests__/env.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/env.ts src/lib/auth/__tests__/env.test.ts
git commit -m "feat(auth): 加入 isAuthBypassEnabled 共用旗標函式"
```

---

### Task 2: 接線 middleware 與 getCurrentUser（server 端放行）

把 Task 1 的旗標接進 middleware 與 `getCurrentUser()`，讓本機（`LOCAL_NO_AUTH=true` + `NODE_ENV=production`）能放行並使用 dev fallback user，同時保留「正式站無金鑰 → 503」的既有安全行為。以測試鎖定 fallback 兩種情境。

**Files:**
- Modify: `src/middleware.ts:9-21`
- Modify: `src/lib/auth/clerk.ts:1-32`
- Test: `src/lib/auth/__tests__/clerk.test.ts`

**Interfaces:**
- Consumes: `isAuthBypassEnabled()`（Task 1，`src/lib/auth/env.ts`）。
- Produces: `getCurrentUser()` 行為變更 — 當 `isAuthBypassEnabled()` 為真且未登入時，回傳／建立 `clerkId: "dev-local-user"`、`email: "dev@localhost"` 的使用者；否則 production 未登入丟 `Error("未登入")`。Task 3 的前端條件式渲染與此無耦合（各自讀 env）。

- [ ] **Step 1: 寫失敗測試（getCurrentUser fallback）**

`src/lib/auth/__tests__/clerk.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { getCurrentUser } from "../clerk";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);

describe("getCurrentUser 免登入 fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // 預設：未登入
    mockAuth.mockResolvedValue({ userId: null } as never);
  });

  it("production + LOCAL_NO_AUTH=true：建立並回傳 dev-local-user", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "true");
    mockFindUnique.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({
      id: "u1",
      clerkId: "dev-local-user",
      email: "dev@localhost",
    } as never);

    const user = await getCurrentUser();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerkId: "dev-local-user",
          email: "dev@localhost",
        }),
      }),
    );
    expect(user.clerkId).toBe("dev-local-user");
  });

  it("production 且未設 LOCAL_NO_AUTH：丟出未登入、不碰 DB", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_NO_AUTH", "");

    await expect(getCurrentUser()).rejects.toThrow("未登入");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/auth/__tests__/clerk.test.ts`
Expected: FAIL — 第一個測試會丟 `未登入`（因為現行 `clerk.ts` 只在 `NODE_ENV !== 'production'` 才啟用 fallback，production 一律丟錯）。

- [ ] **Step 3: 改 `clerk.ts` 用旗標**

`src/lib/auth/clerk.ts` — 加 import（第 2 行後）：

```ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { isAuthBypassEnabled } from '@/lib/auth/env';
```

把第 24-32 行的 fallback 判斷式：

```ts
  } else {
    // 開發環境 fallback
    if (process.env.NODE_ENV !== 'production') {
      userId = DEV_FALLBACK_ID;
      email = 'dev@localhost';
    } else {
      throw new Error('未登入');
    }
  }
```

改為：

```ts
  } else {
    // 免登入放行（本機／開發或 LOCAL_NO_AUTH=true）時使用 fallback user
    if (isAuthBypassEnabled()) {
      userId = DEV_FALLBACK_ID;
      email = 'dev@localhost';
    } else {
      throw new Error('未登入');
    }
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/auth/__tests__/clerk.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 改 `middleware.ts` 用旗標**

`src/middleware.ts` — 加 import（第 1 行後）：

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isAuthBypassEnabled } from "@/lib/auth/env";
```

把第 10-16 行：

```ts
  // 正式環境缺少 Clerk 金鑰時，回傳 503 避免未授權存取
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (process.env.NODE_ENV === "production") {
      return new Response("Service misconfigured", { status: 503 });
    }
    return;
  }
```

改為：

```ts
  // 缺 Clerk 金鑰時：本機／開發或 LOCAL_NO_AUTH=true 放行；正式站回 503 擋未授權
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (!isAuthBypassEnabled()) {
      return new Response("Service misconfigured", { status: 503 });
    }
    return;
  }
```

- [ ] **Step 6: 跑全套測試確認未回歸**

Run: `npm test`
Expected: 既有測試全綠 + 新增 env / clerk 測試通過（總數 = 原 282 + 5）。

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts src/lib/auth/clerk.ts src/lib/auth/__tests__/clerk.test.ts
git commit -m "feat(auth): middleware 與 getCurrentUser 支援 LOCAL_NO_AUTH 免登入放行"
```

---

### Task 3: Clerk 前端條件式渲染（避免無金鑰 render 拋錯）

光靠 server 端放行不夠：`layout.tsx` 無條件包 `<ClerkProvider>`、`sidebar.tsx` 每頁渲染 `<UserButton>`，兩者在「無 publishable key」時會於 render 直接拋錯。改為有 key 才渲染 Clerk 元件。因 build 期 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 內聯，本機 image（不帶 key）恆走無 Clerk 路徑。此 task 無法用單元測試涵蓋 RSC / client render，gate 用型別檢查與全套測試；實際 render 正確性於 Task 5 的整合啟動驗收。

**Files:**
- Modify: `src/app/layout.tsx:21-41`
- Modify: `src/components/layout/sidebar.tsx:210-216`

**Interfaces:**
- Consumes: build 期內聯的 `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`。
- Produces: 無新對外介面（純渲染守衛）。

- [ ] **Step 1: 改 `layout.tsx` 條件式 ClerkProvider**

`src/app/layout.tsx` — 把第 21-41 行的 `RootLayout` 整個函式：

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="zh-TW"
        className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
      >
        <body className="antialiased">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">{children}</main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

改為：

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tree = (
    <html
      lang="zh-TW"
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
    >
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );

  // 有 Clerk 金鑰才包 ClerkProvider；本機免登入（無 key）直接渲染，
  // 避免 ClerkProvider 於無 publishable key 時於 render 拋錯。
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider>{tree}</ClerkProvider>
  ) : (
    tree
  );
}
```

- [ ] **Step 2: 改 `sidebar.tsx` 條件式 UserButton**

`src/components/layout/sidebar.tsx` — 把第 210-216 行：

```tsx
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
```

改為：

```tsx
          {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
          ) : (
            // 免登入模式：無 Clerk 金鑰時以佔位頭像維持版面
            <div className="w-8 h-8 rounded-full bg-white/10" aria-hidden />
          )}
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤結束（exit 0）。

- [ ] **Step 4: 跑全套測試確認未回歸**

Run: `npm test`
Expected: 全綠。

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/layout/sidebar.tsx
git commit -m "feat(auth): Clerk 前端元件改條件式渲染，支援無金鑰免登入"
```

---

### Task 4: Dockerfile 修正 + `.dockerignore` + entrypoint

現行 build 跑 `npm run build`（含 `prisma db push`），build 時連不到 db 會失敗；改成 build 只 `prisma generate` + `next build`，把 `db push` 移到 runtime 的 entrypoint。同時補上必要的 `.dockerignore`（避免把 host 的 `node_modules`、`.env`、`.git`、`.next` 打進 image）。此 task 的 gate 是 image 能 build 成功、entrypoint 語法正確；db push 的實際執行於 Task 5 整合驗收。

**Files:**
- Modify: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Consumes: 專案原始碼、`package-lock.json`、`prisma/`。
- Produces: image 的 `ENTRYPOINT` = `docker/entrypoint.sh`（runtime 先 `prisma db push --skip-generate` 再 `exec npm start`）。Task 5 的 compose `web` 服務依賴此 image。

- [ ] **Step 1: 建立 `.dockerignore`**

`.dockerignore`：

```
node_modules
.next
out
build
dist
.git
.gitignore
coverage
*.log
# 不把任何 .env 打進 image（避免正式 Clerk 金鑰被 build 期內聯）
.env
.env*
docker/.env.docker
# 文件與工具設定，image 用不到
docs
.vscode
.idea
.claude
.playwright-mcp
.gstack
.DS_Store
# 根目錄截圖（勿用 *.png，會排掉 public/ 內的 app／PWA 圖示）
/ad-structure.png
/meta-link-buttons-verified.png
```

- [ ] **Step 2: 建立 `docker/entrypoint.sh`**

`docker/entrypoint.sh`：

```sh
#!/bin/sh
# 容器啟動流程：等 DB 就緒 → 套用 schema（prisma db push）→ 啟動應用
set -e

echo "[entrypoint] 套用資料庫結構 (prisma db push)..."
# 重試以防 DB 尚未完全就緒（compose 已用 depends_on healthy，這裡是雙保險）
n=0
until npx prisma db push --skip-generate; do
  n=$((n + 1))
  if [ "$n" -ge 10 ]; then
    echo "[entrypoint] prisma db push 連續失敗，放棄"
    exit 1
  fi
  echo "[entrypoint] DB 尚未就緒，第 $n 次重試..."
  sleep 3
done

echo "[entrypoint] 啟動應用..."
exec "$@"
```

- [ ] **Step 3: 改 `Dockerfile`**

把 `Dockerfile` 整個檔案內容替換為：

```dockerfile
FROM node:22

WORKDIR /app

# 先複製 lockfile 與 prisma schema（postinstall 會跑 prisma generate）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 複製其他原始碼
COPY . .

# build 不連 DB：只 generate client 與 next build；db push 移到 entrypoint（runtime）
RUN npx prisma generate && npx next build

# runtime 入口：等 DB → prisma db push → npm start
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
```

> 註：移除原 `ENV NODE_ENV=production`，改由 compose 的 `env_file`（Task 5）注入，讓 `LOCAL_NO_AUTH` 等旗標集中管理。`next build` 預設即以 production 模式打包，不受影響。

- [ ] **Step 4: entrypoint 語法檢查**

Run: `sh -n docker/entrypoint.sh`
Expected: 無輸出、exit 0（語法正確）。

- [ ] **Step 5: 確認 Docker daemon 已啟動並 build image**

Run:
```bash
docker info >/dev/null 2>&1 || open -a Docker
docker build -t ad-manager-pro:local .
```
Expected: build 成功，最後出現 `naming to docker.io/library/ad-manager-pro:local` 或 `writing image` 類訊息；過程中 `npx prisma generate` 與 `npx next build` 皆成功，**不**出現連 DB 失敗。

> 若本機未啟動 Docker Desktop，`docker build` 會失敗；先手動開啟 Docker Desktop 待其就緒再重跑。

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker/entrypoint.sh
git commit -m "build(docker): build 期不連 DB，db push 移至 entrypoint，補 .dockerignore"
```

---

### Task 5: docker-compose + 環境變數範本 + gitignore（整合驗收）

把 app 與 Postgres 綁成一個 compose stack，資料存 named volume；提供本機環境變數範本並確保實際 `.env.docker` 不進 git。此 task 是整條免登入流程的端到端驗收：compose up 成功、瀏覽 dashboard 免登入、資料持久化。

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/.env.docker.example`
- Modify: `.gitignore`（新增 `docker/.env.docker`）

**Interfaces:**
- Consumes: Task 4 的 image（`web` 服務 build 自 `Dockerfile`）、`docker/entrypoint.sh`。
- Produces: 可用 `docker compose up -d --build` 啟動的完整 stack（`web` 對外 `localhost:3000`，`db` 資料存 volume `ad-manager-pgdata`）。Task 6 的 launcher 會呼叫此 compose。

- [ ] **Step 1: 建立 `docker-compose.yml`**

`docker-compose.yml`：

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ad_manager_pro
    volumes:
      - ad-manager-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ad_manager_pro"]
      interval: 5s
      timeout: 5s
      retries: 10

  web:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file:
      - docker/.env.docker
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  ad-manager-pgdata:
```

- [ ] **Step 2: 建立 `docker/.env.docker.example`**

`docker/.env.docker.example`：

```dotenv
# 本機 Docker 專用環境變數範本。
# 使用方式：複製本檔為 docker/.env.docker，填入 ENCRYPTION_KEY 後即可。
# 注意：docker/.env.docker 內含金鑰，已被 .gitignore 排除，切勿提交。

# 指向 compose 內的 db 服務（服務名即 host）
DATABASE_URL=postgresql://postgres:postgres@db:5432/ad_manager_pro?schema=public

# 跑正式伺服器（next start），速度較 dev 有感
NODE_ENV=production

# 啟用免登入（僅本機）；正式站絕不設此旗標
LOCAL_NO_AUTH=true

# crypto 需要：用 `openssl rand -hex 32` 產生一組 64 字元 hex 貼在這裡
# （不填也能開機，但之後在設定頁存 Windsor／LINE 金鑰時會於 production 丟錯）
ENCRYPTION_KEY=

# 本機不自動同步、不自動發 LINE
ENABLE_AUTO_SYNC=false
ENABLE_LINE_CRON=false

# LINE 卡片按鈕連回用
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: `.gitignore` 加入 `docker/.env.docker`**

`.gitignore` — 在第 22-23 行（`# Environment variables` / `.env` 區塊）後補一行：

```
# Environment variables
.env
.env*.local
docker/.env.docker
```

- [ ] **Step 4: 建立本機 `.env.docker` 並產生金鑰**

Run:
```bash
cp docker/.env.docker.example docker/.env.docker
KEY=$(openssl rand -hex 32)
# 將產生的金鑰寫入 ENCRYPTION_KEY（macOS sed 需 -i ''）
sed -i '' "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" docker/.env.docker
grep '^ENCRYPTION_KEY=' docker/.env.docker
```
Expected: 印出 `ENCRYPTION_KEY=` 後接 64 字元 hex。

- [ ] **Step 5: 確認 `.env.docker` 不會被 git 追蹤**

Run: `git check-ignore docker/.env.docker`
Expected: 印出 `docker/.env.docker`（代表已被忽略）。

- [ ] **Step 6: 啟動 stack**

Run:
```bash
docker compose up -d --build
docker compose ps
```
Expected: `db` 與 `web` 皆為 `running`，`db` 顯示 `healthy`。

- [ ] **Step 7: 驗證免登入可進 dashboard**

Run:
```bash
# 等 web 起來
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3000/dashboard && break; sleep 2; done
curl -s -o /dev/null -w "%{http_code}\n" -L http://localhost:3000/dashboard
```
Expected: 印出 `200`（不被導去 Clerk 登入）。

- [ ] **Step 8: 驗證資料持久化（volume）**

Run:
```bash
docker compose exec -T db psql -U postgres -d ad_manager_pro \
  -c "CREATE TABLE IF NOT EXISTS _persist_check(id int); INSERT INTO _persist_check VALUES (1);"
docker compose down
docker compose up -d
for i in $(seq 1 30); do docker compose exec -T db pg_isready -U postgres -d ad_manager_pro && break; sleep 2; done
docker compose exec -T db psql -U postgres -d ad_manager_pro -tc "SELECT count(*) FROM _persist_check;"
docker compose exec -T db psql -U postgres -d ad_manager_pro -c "DROP TABLE _persist_check;"
```
Expected: `SELECT count(*)` 回 `1`（重啟後資料仍在）。

- [ ] **Step 9: 收拾（保留資料）**

Run: `docker compose down`
Expected: 兩服務停止，volume `ad-manager-pgdata` 仍存在（未加 `-v`）。

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml docker/.env.docker.example .gitignore
git commit -m "feat(docker): compose 綁 app + Postgres，加免登入環境變數範本"
```

---

### Task 6: macOS `.app` 啟動器與停止器

建立雙擊即用的 `AdManagerPro.app`（啟動）與 `AdManagerPro-Stop.app`（停止）。launcher 以自身 bundle 位置推導專案根目錄（`.app` 放在 repo 根目錄），避免寫死使用者絕對路徑；圖示用 `public/icon-512.png` 轉 `.icns`。

**Files:**
- Create: `AdManagerPro.app/Contents/Info.plist`
- Create: `AdManagerPro.app/Contents/MacOS/launcher`
- Create: `AdManagerPro.app/Contents/Resources/icon.icns`（由建置步驟產生）
- Create: `AdManagerPro-Stop.app/Contents/Info.plist`
- Create: `AdManagerPro-Stop.app/Contents/MacOS/launcher`
- Create: `AdManagerPro-Stop.app/Contents/Resources/icon.icns`（由建置步驟產生）

**Interfaces:**
- Consumes: Task 5 的 `docker-compose.yml`（launcher 於 repo 根目錄跑 `docker compose`）、`public/icon-512.png`。
- Produces: 兩個可雙擊的 `.app`。

- [ ] **Step 1: 建立目錄結構**

Run:
```bash
mkdir -p AdManagerPro.app/Contents/MacOS AdManagerPro.app/Contents/Resources
mkdir -p AdManagerPro-Stop.app/Contents/MacOS AdManagerPro-Stop.app/Contents/Resources
```

- [ ] **Step 2: 建立啟動器 `Info.plist`**

`AdManagerPro.app/Contents/Info.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Ad Manager Pro</string>
  <key>CFBundleDisplayName</key><string>Ad Manager Pro</string>
  <key>CFBundleIdentifier</key><string>com.liweisia.admanagerpro.launcher</string>
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

- [ ] **Step 3: 建立啟動器 `launcher`**

`AdManagerPro.app/Contents/MacOS/launcher`：

```bash
#!/bin/bash
# Ad Manager Pro 本機啟動器：確認 Docker → compose up → 開瀏覽器
# 以自身 bundle 位置推導專案根目錄（.app 需放在 repo 根目錄）
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
URL="http://localhost:3000/dashboard"

notify() {
  osascript -e "display notification \"$1\" with title \"Ad Manager Pro\"" >/dev/null 2>&1 || true
}

# 1. 確認 Docker daemon 已啟動；沒開就嘗試開起來並等待（最多約 120 秒）
if ! docker info >/dev/null 2>&1; then
  notify "正在啟動 Docker Desktop..."
  open -a Docker || {
    osascript -e 'display alert "找不到 Docker Desktop" message "請先安裝 Docker Desktop 後再試。"'
    exit 1
  }
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi

# 2. 啟動服務（首次會 build，需數分鐘）
cd "$PROJECT_DIR"
notify "啟動服務中，請稍候..."
docker compose up -d --build

# 3. 等 web 回應（最多約 120 秒）
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "$URL" && break
  sleep 2
done

# 4. 開瀏覽器
notify "已就緒，開啟瀏覽器"
open "$URL"
```

- [ ] **Step 4: 建立停止器 `Info.plist`**

`AdManagerPro-Stop.app/Contents/Info.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Ad Manager Pro 停止</string>
  <key>CFBundleDisplayName</key><string>Ad Manager Pro 停止</string>
  <key>CFBundleIdentifier</key><string>com.liweisia.admanagerpro.stop</string>
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

- [ ] **Step 5: 建立停止器 `launcher`**

`AdManagerPro-Stop.app/Contents/MacOS/launcher`：

```bash
#!/bin/bash
# Ad Manager Pro 停止器：停止服務（保留資料 volume）
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

notify() {
  osascript -e "display notification \"$1\" with title \"Ad Manager Pro\"" >/dev/null 2>&1 || true
}

cd "$PROJECT_DIR"
notify "停止服務中..."
docker compose down
notify "已停止（資料保留）"
```

- [ ] **Step 6: 賦予執行權限**

Run:
```bash
chmod +x AdManagerPro.app/Contents/MacOS/launcher AdManagerPro-Stop.app/Contents/MacOS/launcher
```

- [ ] **Step 7: 產生 `.icns` 圖示**

Run:
```bash
ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size public/icon-512.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o AdManagerPro.app/Contents/Resources/icon.icns
cp AdManagerPro.app/Contents/Resources/icon.icns AdManagerPro-Stop.app/Contents/Resources/icon.icns
ls -la AdManagerPro.app/Contents/Resources/icon.icns
```
Expected: `icon.icns` 存在且非 0 byte。

- [ ] **Step 8: 驗證 plist 格式**

Run:
```bash
plutil -lint AdManagerPro.app/Contents/Info.plist AdManagerPro-Stop.app/Contents/Info.plist
```
Expected: 兩檔皆印 `OK`。

- [ ] **Step 9: 驗證 launcher 路徑推導正確**

Run:
```bash
bash -c 'cd AdManagerPro.app/Contents/MacOS && cd "$(dirname "$(pwd)/launcher")/../../.." && pwd'
```
Expected: 印出 repo 根目錄絕對路徑（`.../ad-manager-pro`）。

- [ ] **Step 10: 實測雙擊啟動（人工驗收）**

Run: `open AdManagerPro.app`
Expected: 出現「啟動服務中」通知 → 數十秒後瀏覽器自動開到 `http://localhost:3000/dashboard` 並顯示 dashboard（免登入）。之後 `open AdManagerPro-Stop.app` 出現「已停止」通知、`docker compose ps` 無執行中服務。

> macOS 首次開啟未簽章 `.app` 可能被 Gatekeeper 攔（「無法驗證開發者」）。若被攔：於「系統設定 → 隱私權與安全性」按「仍要開啟」，或 `xattr -dr com.apple.quarantine AdManagerPro.app AdManagerPro-Stop.app`。此步驟寫入 Task 7 的 README。

- [ ] **Step 11: Commit**

```bash
git add AdManagerPro.app AdManagerPro-Stop.app
git commit -m "feat(docker): macOS 雙擊啟動器與停止器 .app"
```

---

### Task 7: 使用說明文件

寫一份首次設定與日常使用說明，涵蓋前置需求、三步設定、雙擊使用、常見問題（Gatekeeper、port 被占、清資料）。

**Files:**
- Create: `docker/README.md`

**Interfaces:**
- Consumes: Task 4-6 的所有產出。
- Produces: 無程式介面（文件）。

- [ ] **Step 1: 建立 `docker/README.md`**

`docker/README.md`：

````markdown
# 本機 Docker 執行說明

雙擊一個 app 圖示，就能在自己的 Mac 上把 Ad Manager Pro（含資料庫）跑起來，免登入直接使用。

## 前置需求

- 安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 並至少開啟過一次。

## 首次設定（一次即可）

1. **產生環境變數檔**（在 repo 根目錄執行）：
   ```bash
   cp docker/.env.docker.example docker/.env.docker
   ```
2. **填入加密金鑰**（設定頁存 API 金鑰會用到）：
   ```bash
   KEY=$(openssl rand -hex 32)
   sed -i '' "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" docker/.env.docker
   ```
3. **首次啟動並 build**（約數分鐘）：雙擊 `AdManagerPro.app`，或執行 `docker compose up -d --build`。

> `docker/.env.docker` 內含金鑰，已被 `.gitignore` 排除，切勿提交。

## 日常使用

- **啟動**：雙擊 `AdManagerPro.app`（會自動開 Docker、起服務、開瀏覽器到 `http://localhost:3000`）。
- **停止**：雙擊 `AdManagerPro-Stop.app`（停止服務、保留資料）。
- 想加到 Dock：把 `AdManagerPro.app` 拖到 Dock（`.app` 須留在 repo 根目錄，launcher 以自身位置推導專案路徑）。

## 常見問題

- **首次開啟被 macOS 攔（「無法驗證開發者」）**：到「系統設定 → 隱私權與安全性」按「仍要開啟」，或執行：
  ```bash
  xattr -dr com.apple.quarantine AdManagerPro.app AdManagerPro-Stop.app
  ```
- **port 3000 被占用**：先關掉占用程式，或改 `docker-compose.yml` 的 `ports` 為 `"3001:3000"` 後改用 `http://localhost:3001`。
- **完全清除資料重來**：`docker compose down -v`（`-v` 會刪掉資料 volume，資料無法復原）。
- **免登入說明**：本機以 `LOCAL_NO_AUTH=true` 放行 dev fallback 使用者，不需要 Clerk 帳號；此旗標僅存在於本機 `docker/.env.docker`，正式站不受影響。
````

- [ ] **Step 2: fresh-context read-back 驗收**

派一個 fresh-context subagent（只給 `docker/README.md` 路徑與原始需求「讓使用者雙擊 app 就能在本機 Docker 啟用、免登入」），要求列出：照著做能否成功啟動？有無缺漏步驟或對不上實際檔案（`AdManagerPro.app`、`docker/.env.docker.example`、`docker-compose.yml`）的地方？語言是否純繁體中文。依回報修正缺漏。

- [ ] **Step 3: Commit**

```bash
git add docker/README.md
git commit -m "docs(docker): 本機雙擊即用執行說明"
```

---

## Self-Review

**1. Spec coverage（逐項對照 spec）：**
- 目標「雙擊 app → Docker 起 → 免登入進 dashboard → 資料持久化」 → Task 5（整合驗收 Step 6-9）+ Task 6（雙擊）✅
- 方案 A（`LOCAL_NO_AUTH` + `isAuthBypassEnabled()`）→ Task 1 + Task 2 ✅
- Clerk 前端兩顆地雷（ClerkProvider、UserButton）→ Task 3 ✅
- `.dockerignore`（含 `*.png` 陷阱、排 `.env`）→ Task 4 Step 1 ✅
- Dockerfile 改（db push 移 runtime）→ Task 4 Step 3 ✅
- entrypoint（等 db → db push → start）→ Task 4 Step 2 ✅
- docker-compose（db volume healthcheck / web depends_on healthy env_file）→ Task 5 Step 1 ✅
- `.env.docker.example` + 不進 git → Task 5 Step 2/3/5 ✅
- `.app` 啟動器 + 停止器 + icns → Task 6 ✅
- README（首次設定 + 常見問題）→ Task 7 ✅
- 驗收條件 1-6 → Task 5 Step 6-9（1/2/3）、Task 6 Step 10（4）、Task 2 Step 2 的第二測試（5）、Task 2 Step 6 / Task 3 Step 4（6）✅

**2. Placeholder 掃描：** 無 TBD／TODO／「適當處理」類；每個 code step 都附完整內容。✅

**3. 型別一致性：** `isAuthBypassEnabled()` 名稱於 Task 1 定義、Task 2 兩處 import 一致；`dev-local-user` / `dev@localhost` 於 clerk.ts 與 clerk.test.ts 一致；compose 服務名 `db`／`web`、volume `ad-manager-pgdata`、image tag `ad-manager-pro:local` 全文一致；`DATABASE_URL` host `db` 與 compose 服務名一致。✅

**備註（spec 差異，已在計畫內修正並優於 spec）：** spec 原寫 launcher「把專案絕對路徑寫死」；計畫改為 launcher 以自身 bundle 位置推導專案根目錄（`.app` 放 repo 根目錄），更穩健、無使用者專屬路徑，且不影響任何驗收條件。

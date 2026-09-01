# Ad Manager Pro 本機 Docker「雙擊即用」設計

日期：2026-09-01
狀態：設計已核准（採方案 A）

## 目標

讓使用者在自己的 Mac 上，**雙擊一個 app 圖示**就能把 Ad Manager Pro 完整跑起來，不用開終端機、不用手動下指令、不用自己裝 Node/Prisma/Postgres。

使用體驗：
1. 雙擊 Dock／桌面上的 `AdManagerPro.app`
2. 自動確認 Docker Desktop 已啟動（沒開就嘗試開起來並等待）
3. `docker compose up`（app + Postgres 一起）
4. 等服務健康後，自動開瀏覽器到 `http://localhost:3000`
5. **免登入**直接進 dashboard
6. 資料存在 docker named volume，關機重開資料還在

## 非目標（YAGNI）

- 多階段 `output: standalone` 精簡 image（本機用，單階段夠用）
- 本機走真正的 Clerk 登入流程
- 預先把 Windsor／LINE 憑證塞進環境變數（照舊在 app 設定頁裡填）
- 上架／散佈這個 `.app`（純本機自用）

## 架構

```
AdManagerPro.app (macOS .app bundle)
   └─ Contents/MacOS/launcher（shell 腳本）
        1. docker info 檢查 daemon；沒開 → open -a Docker → 輪詢至就緒
        2. cd 到專案目錄（絕對路徑，寫在腳本頂端變數，可改）
        3. docker compose up -d --build
        4. 輪詢 http://localhost:3000 直到回應
        5. open http://localhost:3000
        6. osascript 顯示 macOS 通知回報進度
        │
   docker-compose.yml
   ├─ db  : postgres:16-alpine
   │         - 資料存 named volume: ad-manager-pgdata
   │         - healthcheck: pg_isready
   └─ web : build 自專案 Dockerfile
             - depends_on: db (condition: service_healthy)
             - env_file: docker/.env.docker
             - ports: 3000:3000
             - entrypoint: docker/entrypoint.sh
                 a. 等 db 就緒
                 b. npx prisma db push（建／更新表結構）
                 c. exec npm start（正式伺服器）
```

## 關鍵決策：runtime／免登入（方案 A，已核准）

**問題**：免登入靠程式現有的 dev fallback user，但它只在 `NODE_ENV !== "production"` 時生效
（`src/middleware.ts:11-16`、`src/lib/auth/clerk.ts:26-31`）。而 `next start` 正式伺服器會強制
`NODE_ENV=production`，兩者衝突。

**採用方案 A**：production build + 一個**預設關閉**的 `LOCAL_NO_AUTH` 環境旗標。

- `src/middleware.ts`：缺 Clerk 金鑰時，原本只在非 production 放行；改為「非 production **或** `LOCAL_NO_AUTH==="true"`」時放行。
- `src/lib/auth/clerk.ts`：dev fallback 判斷式同步改為「非 production **或** `LOCAL_NO_AUTH==="true"`」時啟用 fallback user。
- 旗標**預設不存在**；Zeabur 正式站不設此旗標 → 行為與現在完全相同、預設安全。
- 只有本機 `docker/.env.docker` 會設 `LOCAL_NO_AUTH=true`。
- 為 DRY，抽出共用純函式 `isAuthBypassEnabled()`（`src/lib/auth/env.ts`），middleware 與 clerk.ts 共用。

**免登入的兩顆隱藏地雷（調查後補入，原設計漏掉）**：光放行還不夠——Clerk 前端在「無 publishable key」時會於 render 直接丟錯，middleware 放行也救不了：

- `src/app/layout.tsx:27` **無條件**包 `<ClerkProvider>`；無 key 時 provider 會拋錯。
  → 改為「有 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 才包 ClerkProvider，否則直接渲染子樹」。
- `src/components/layout/sidebar.tsx:210` 用 `<UserButton>`（sidebar 在 layout 每頁都渲染），
  無 Provider 時會拋「must be used within ClerkProvider」。
  → 改為「有 key 才渲染 UserButton」。
- 兩者都讀 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`；Next.js 於 build 期把此 `NEXT_PUBLIC_*` 內聯：
  本機 image build 未帶 key → 恆走無 Clerk 路徑（免登入）；Zeabur build 帶 key → 恆走 ClerkProvider 路徑，行為不變。

理由：本機當工具天天用，正式伺服器頁面速度比 dev 伺服器有感；旗標預設關、對正式站零影響。
（否決方案 B「容器內跑 next dev」：零程式改動但每頁即時編譯太慢，且 dev 伺服器定位不對。）

## 檔案清單

### 新增
- `.dockerignore`
  現有 Dockerfile 用 `COPY . .` 但無 `.dockerignore`，會把 host 的 `node_modules`（含 mac 原生 binary）、
  `.env`（含正式金鑰，洩漏風險）、`.git`、`.next` 一起打進 image。此為必修項。
  排除：`node_modules`、`.next`、`.git`、`.env*`、`docker/.env.docker`、`docs`、測試快取、
  以及根目錄截圖（`/ad-structure.png`、`/meta-link-buttons-verified.png` 等，用根路徑前綴，
  **不可**用 `*.png` 以免排掉 `public/` 內的 app／PWA 圖示）。
- `docker-compose.yml`
  db（postgres:16-alpine + volume + healthcheck）、web（build + depends_on healthy + env_file + entrypoint）。
- `docker/entrypoint.sh`
  等 db → `npx prisma db push` → `exec npm start`。
- `docker/.env.docker.example`
  本機環境變數範本（見下）。實際 `.env.docker` 由使用者複製後填入隨機 `ENCRYPTION_KEY`，**不進 git**。
- `AdManagerPro.app`
  macOS `.app` bundle：`Contents/Info.plist` + `Contents/MacOS/launcher`（executable）+
  `Contents/Resources/icon.icns`（用 `public/icon-512.png` 轉）。
- `AdManagerPro-Stop.app`
  同結構，launcher 執行 `docker compose down`（停止、保留資料）。
- `docker/README.md`
  首次設定 3 步驟 + 常見問題（Docker 沒裝、port 被占、資料清除）。

### 改動
- `Dockerfile`
  build 步驟由 `npm run build`（含 `prisma db push`，build 時連不到 db 會失敗）
  改為 `npx prisma generate && npx next build`（db push 移到 entrypoint 於 runtime 執行）。
- `src/middleware.ts`
  放行條件加入 `LOCAL_NO_AUTH==="true"`（方案 A，用 `isAuthBypassEnabled()`）。
- `src/lib/auth/clerk.ts`
  dev fallback 條件加入 `LOCAL_NO_AUTH==="true"`（方案 A，用 `isAuthBypassEnabled()`）。
- `src/app/layout.tsx`
  條件式 `ClerkProvider`（有 key 才包）。
- `src/components/layout/sidebar.tsx`
  條件式 `UserButton`（有 key 才渲染）。
- `.gitignore`
  加入 `docker/.env.docker`。

新增：
- `src/lib/auth/env.ts` — `isAuthBypassEnabled()` 純函式（middleware / clerk.ts 共用）。

## 本機環境變數（`docker/.env.docker`）

| 變數 | 值 | 說明 |
|------|-----|------|
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/ad_manager_pro?schema=public` | 指向 compose 的 db 服務 |
| `NODE_ENV` | `production` | 跑正式伺服器（速度） |
| `LOCAL_NO_AUTH` | `true` | 啟用免登入（僅本機） |
| `ENCRYPTION_KEY` | （隨機 32-byte hex） | crypto 需要，使用者首次自行產生 |
| `ENABLE_AUTO_SYNC` | `false` | 本機不自動同步（`src/lib/cron/dynamic-scheduler.ts:11` 已確認開關） |
| `ENABLE_LINE_CRON` | `false` | 本機不自動發 LINE（`src/lib/cron/scheduler.ts:52` 已確認開關） |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | LINE 卡片按鈕連回用 |

不帶 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`（免登入前提）。

## 前提／風險

- 需先安裝 **Docker Desktop**；launcher 會嘗試自動開，但未安裝時使用者要手動裝一次。
- `.app` 的 launcher 會把專案絕對路徑寫死在腳本頂端變數（路徑固定，OK；搬 repo 要改一行）。
- 首次 `docker compose up` 需 build，約數分鐘；之後啟動秒開。
- `.app` bundle 內的 `launcher` 需 `chmod +x`；`.icns` 由建置步驟產生。

## 驗收條件

1. `docker compose up --build` 一次成功，db 與 web 皆 healthy，`prisma db push` 於 entrypoint 成功建表。
2. 瀏覽 `http://localhost:3000` 不被導去登入、直接進 dashboard（免登入 fallback 生效）。
3. 停掉再 `up`，先前資料仍在（volume 持久化驗證）。
4. 雙擊 `AdManagerPro.app`：Docker 自動起、服務起、瀏覽器自動開到 localhost:3000。
5. 不設 `LOCAL_NO_AUTH` 且 `NODE_ENV=production` 時，middleware 仍回 503（確認正式站行為未被破壞）。
6. `npm test` 既有測試全綠（auth 改動不影響現有測試）。

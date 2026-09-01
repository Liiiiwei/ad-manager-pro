# Ad Manager Pro 原生本機 Mac App 設計

- 日期：2026-09-01
- 狀態：設計已核准，待寫實作計畫
- 相關：取代既有 Docker 版啟動器（`docs/superpowers/plans/2026-09-01-docker-local-app.md`）

## 目標

把專案做成「雙擊即開、約 3–8 秒進畫面」的本機 Mac App，**不**打包成 Electron/Tauri 單一執行檔。
沿用既有的 `.app` 外殼（Finder 雙擊），但啟動邏輯從 Docker 換成原生 Node，資料庫用內嵌 Postgres。

### 非目標

- 不做背景常駐服務（開機自動跑、關 app 後仍推播）。若日後要，屬另一題（launchd 常駐）。
- 不改動雲端 Zeabur 部署流程；本機與線上共用同一份程式碼與 Postgres 引擎。
- 不做程式碼「熱更新」；本機版是「build 一次、快速啟動」，改碼後需手動重建。

## 核心決策（brainstorming 已定）

1. **啟動模型 = B（點了才啟動，但快）**：原生 Node 跑「已 build 好」的正式版，非 Docker、非 dev 模式。
2. **本機資料庫 = A（內嵌 Postgres）**：用 `embedded-postgres`，與線上 Zeabur 同款引擎，**schema 一行都不改**，行為零差異，避免 SQLite 的 `enum` / `Json` 分歧與 282 個測試回歸風險。
3. **認證 = 沿用既有 `LOCAL_NO_AUTH`**：免登入放行已在 middleware、`getCurrentUser`、前端 Clerk 條件式渲染做好，本機直接開旗標即可，不碰 Clerk。
4. **程式碼更新 = 手動重建動作**：另給一個「重建」入口（`.app` 或一行指令），保住日常秒開速度。

## 架構

```
雙擊 AdManagerPro.app
   └─ launcher(bash)：定位 node → 執行 start.mjs → 等埠通 → 開瀏覽器
        ├─ 內嵌 Postgres（資料存 .local-db/，跑在 5433 埠，避開系統既有 5432）
        ├─ prisma db push（確保資料表存在；已存在則近乎秒過）
        ├─ next start（已 build 的正式版，跑在 3000 埠）
        └─ 就緒後 open http://localhost:3000/dashboard

雙擊 AdManagerPro-Stop.app → 送關閉訊號給 start.mjs → 先停 Next 再停 Postgres
```

## 元件

| 元件 | 職責 | 依賴 | 介面 |
|------|------|------|------|
| `AdManagerPro.app/Contents/MacOS/launcher`（bash） | 定位 node、呼叫 `start.mjs`、開瀏覽器、失敗跳原生 alert/通知 | 系統 node | 雙擊 → 無參數 |
| `scripts/local-app/start.mjs` | 生命週期管家：起 Postgres → db push → 起 Next → 攔截關閉訊號乾淨收尾 | `embedded-postgres`、`next` | `node start.mjs`；監聽 SIGTERM/SIGINT |
| `scripts/local-app/setup.mjs` | 首次設定：產生穩定 `ENCRYPTION_KEY`、寫 `.env.local`、缺 `node_modules` 則 `npm ci`、`next build` | node、npm、next | `node setup.mjs`（冪等） |
| `AdManagerPro-Rebuild.app` + npm script `app:rebuild` | 手動重建：重跑 `next build`，讓 app 反映最新程式碼。npm script 為真實入口，`.app` 只是雙擊觸發它 | next | 雙擊 / `npm run app:rebuild` |
| `AdManagerPro-Stop.app/Contents/MacOS/launcher`（bash） | 找到執行中的 start.mjs / Next / Postgres 並乾淨關閉 | — | 雙擊 |
| `.env.local`（本機、gitignore） | `DATABASE_URL`（指向內嵌 pg）、`ENCRYPTION_KEY`、`LOCAL_NO_AUTH=1` | — | 檔案 |
| `.local-db/`（本機、gitignore） | 內嵌 Postgres 資料檔 | — | 目錄 |
| `.local-app.log`（本機、gitignore） | 啟動 / 錯誤紀錄 | — | 檔案 |

### 元件邊界檢查

- `start.mjs` 只管「拉起服務 + 收尾」，不含首次設定（交給 `setup.mjs`），可獨立測試。
- `setup.mjs` 冪等：已設定過就跳過各步，可安全重跑。
- launcher(bash) 極薄：只定位 node 與開瀏覽器，商業邏輯全在 Node 腳本，方便測與改。

## 資料流 / 啟動流程

### 首次（慢，一次性）
1. launcher 定位 node → 呼叫 `start.mjs`；`start.mjs` 偵測未設定 → 先跑 `setup.mjs`。
2. `setup.mjs`：產生 `ENCRYPTION_KEY`（32-byte hex）寫入 `.env.local`；設 `LOCAL_NO_AUTH=1`、`DATABASE_URL`（內嵌 pg 連線字串）；缺 `node_modules` 則 `npm ci`；`next build`。
3. `embedded-postgres` 首次 `initialize()` 會下載對應平台 pg 執行檔（約 20–30MB）並建 data dir。
4. `prisma db push` 建表。
5. `next start` → 等埠通 → 開瀏覽器。全程 macOS 通知列顯示「首次設定中…」。

### 之後每次（快，目標 3–8 秒）
1. launcher 定位 node → `start.mjs`。
2. 起內嵌 Postgres（data dir 已存在，直接啟動）。
3. `prisma db push`（無變更近乎秒過）。
4. `next start`（`.next` 已存在）。
5. 等 3000 回應 → 開瀏覽器。

### 關閉
`AdManagerPro-Stop.app` → 送訊號 → `start.mjs` 攔 SIGTERM/SIGINT → 先停 Next child → 再 `pg.stop()` → 退出。

## 錯誤與狀態處理（對應 CLAUDE.md「UI 4 態」精神，落在啟動器層）

- **loading**：通知列顯示「首次設定中…」/「啟動服務中…」，`.local-app.log` 落詳細。
- **error**：
  - 找不到 node → 原生 alert 指引安裝或指定路徑，不靜默失敗。
  - **Finder PATH 陷阱**：`.app` 不繼承 shell PATH。launcher 依序找 `/opt/homebrew/bin`、`/usr/local/bin`、常見 nvm 路徑、`$SHELL -lc 'command -v node'`。此為本類啟動器最常見坑，設計上優先處理。
  - 埠 3000 / 5433 被佔用或啟動逾時 → 通知列報錯 + log。
- **empty**：本機 DB 初始為空，靠打開 app 後在設定頁填 Windsor / LINE 金鑰、再同步資料。屬正常初始態。
- **success**：埠通後開瀏覽器到 `/dashboard`。

## 設定與秘密

- `ENCRYPTION_KEY` 一次產生後固定寫在 `.env.local`，重開後才解得開既存的加密金鑰（Windsor / LINE 存 DB 的加密資料）。
- Windsor / LINE 金鑰仍是「打開 app → 設定頁輸入 → 加密存本機 DB」，與線上一致。

## 已知限制

- **背景排程只在 app 開著時跑**：`instrumentation.ts` 的 node-cron（LINE 每日 08:30 摘要、10/14/18/22 異常檢查）只有 app 執行時有效，關掉即停、不推播。本機版定位是「打開才在跑」。要本機定時推播需 launchd 常駐，屬另一題，本版不做。
- 改程式碼後需手動「重建」才會反映最新版（換取日常秒開速度）。

## 埠與路徑約定

- Next：`3000`（沿用）。
- 內嵌 Postgres：`5433`（避開系統預設 5432 衝突）。
- 本機資料：`.local-db/`；本機設定：`.env.local`；log：`.local-app.log`；三者加入 `.gitignore`。

## 測試策略

- `setup.mjs` 冪等性：重跑不重複產生 `ENCRYPTION_KEY`、不覆蓋既有 `.env.local` 關鍵值。
- `start.mjs` 收尾：模擬 SIGTERM 後確認 Next 與 Postgres 都被停、data dir 未被鎖。
- node 定位：在缺 PATH 環境（模擬 Finder）下能找到 node。
- 端到端：首次 build 後熱啟動計時落在數秒級、瀏覽器能開到 `/dashboard`。
- 既有 282 個測試：不因本機化而改動，維持綠燈（因 schema 與引擎皆不變）。

## 交付與相容

- **沿用同一個 `AdManagerPro.app`**：改寫其 `Contents/MacOS/launcher` 內容（Docker → 原生），圖示與 `.app` 外殼不動。`AdManagerPro-Stop.app` 同樣改寫為原生關閉。
- **Docker 檔案保留、但 `.app` 不再觸發**：`docker-compose.yml`、`Dockerfile`、`docker/` 留著供進階使用者手動 `docker compose up`，不刪除；日常雙擊一律走原生路徑。
- Zeabur 線上部署不受影響。

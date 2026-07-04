# LINE 每日摘要推播 + /daily 行動摘要頁 設計文件

> 日期：2026-07-04
> 狀態：已定案（架構決策已於對話中與使用者確認：維持 Zeabur 部署、in-app cron 排程、LINE Messaging API、保留 Clerk 會員系統）
> 參考範本：plaisir 專案 `e-com/shopline-line-bot/`（Line.gs / Flex.gs 的 Messaging API push 模式）

## 目標

讓使用者不開電腦也能掌握廣告帳戶狀態：

1. **每天 08:30（Asia/Taipei）** LINE 推播每日摘要卡（昨日花費、本月預算配速、ROAS/CPA、異常清單），點卡片連到 `/daily` 行動摘要頁看細節。
2. **盤中每 4 小時**（10:00/14:00/18:00/22:00 Taipei）跑異常規則檢查，有新觸發才推播警報卡；無異常不打擾。
3. `/daily` 頁 + PWA manifest，手機加入主畫面即為輕量 App。

## 非目標（YAGNI）

- 不做 LINE webhook 雙向互動（bot 回覆指令）— 只做單向 push。
- 不做多收件人管理 UI — 每個使用者一組 userId/groupId 字串欄位。
- 不做推播歷史頁 — 既有通知鈴鐺（AlertNotification）已涵蓋。
- 不搬既有 client-side 資料流到 server — `/daily` 沿用既有 client hooks 模式。

## 架構總覽

```
┌─ Zeabur 常駐 Next.js server ─────────────────────────────┐
│ src/instrumentation.ts（新增，Next.js register()）        │
│   └→ initCronJobs()（既有 singleton）                     │
│        ├→ 既有：dynamic-scheduler 每小時 Notion 同步輪詢   │
│        ├→ 新增：daily digest job  08:30 Asia/Taipei       │
│        └→ 新增：anomaly check job 10/14/18/22 Asia/Taipei │
│                                                          │
│ job 內部直接 import lib 函式執行（不經 HTTP、不受 Clerk    │
│ middleware 影響），逐一處理啟用 LINE 推播的使用者：          │
│   decrypt(windsorApiKey) → fetchWindsor →                │
│   buildDailySummary()（純函式）→ buildDigestFlex() →      │
│   pushLine()                                             │
└──────────────────────────────────────────────────────────┘
```

### 排程啟動點修正（關鍵）

盤點發現：`initCronJobs()` 目前只在第一次有人打 `/api/sync-notion` 時因模組載入而啟動 —— 沒人打就永遠不啟動。本案新增 `src/instrumentation.ts`（Next.js 官方 `register()` hook，nodejs runtime 才執行），server 一啟動就呼叫 `initCronJobs()`。既有 sync-notion 的觸發保留不動（initCronJobs 是 singleton，重複呼叫無害）。

### 新排程 job 的掛法

在 `src/lib/cron/scheduler.ts`（或獨立 `monitor-scheduler.ts`）用 node-cron 直接掛兩條固定時刻 job，**用 node-cron 的 `timezone: "Asia/Taipei"` 選項**，不做 UTC 換算：

- `cron.schedule("30 8 * * *", runDailyDigestForAllUsers, { timezone: "Asia/Taipei" })`
- `cron.schedule("0 10,14,18,22 * * *", runAnomalyCheckForAllUsers, { timezone: "Asia/Taipei" })`

不走既有 SyncSchedule polling 機制（那是給使用者自訂 Notion 同步排程用的；監控排程是系統級固定時刻，不需要每人一筆 DB 排程）。

## 元件設計

### 1. UserSettings 新欄位（Prisma schema）

```prisma
lineChannelToken  String?   // AES-256-GCM 加密存放（比照 windsorApiKey）
lineRecipientId   String?   // U 開頭 userId 或 C 開頭 groupId，明文
linePushEnabled   Boolean   @default(false)
```

- Token 寫入走 `encryptApiKey`、讀取走 `decryptApiKey`（`src/lib/utils/crypto.ts` 既有）。
- 設定 API：`src/app/api/settings/route.ts` 比照 accountBudgets 模式加欄位（Zod 驗證、GET 只回 `hasLineToken` 布林不回值）。

### 2. LINE client（`src/lib/line/client.ts`）

移植 plaisir `Line.gs` 模式到 TypeScript：

- `pushLineMessage(token, to, messages[])` → POST `https://api.line.me/v2/bot/message/push`，`Authorization: Bearer {token}`。
- 失敗回傳結構化錯誤（HTTP status + LINE error message），呼叫端記 log 不 throw 穿透（單一使用者失敗不影響其他租戶）。
- 免費額度 200 則/月；日報 30 則 + 警報約 10-30 則，在額度內。超額時 LINE 回 429，記 log 即可。

### 3. Flex 訊息組裝（`src/lib/line/flex.ts`）

移植 plaisir `Flex.gs` bubble 卡模式，純函式、可單元測試：

- `buildDigestFlex(summary)` → 每日摘要卡：標題（日期）、昨日花費、本月配速（進度條顏色紅 >110% / 黃 90-110% / 綠 <90%，與 /initiatives 頁配速邏輯一致）、ROAS、CPA、異常數，底部按鈕連 `{APP_URL}/daily`。
- `buildAlertFlex(alerts[])` → 警報卡：規則名、指標、當前值 vs 門檻、嚴重度色。
- 純文字備援：Flex 組裝失敗或內容超限時退回 `pushText` 一段文字摘要。

### 4. 每日摘要組裝（`src/lib/digest/build-daily-summary.ts`）

純函式（TDD 核心）：`buildDailySummary(records, options)` where options = `{ manualBudgets, today, daysInMonth }`：

- **昨日花費**：以 `date` 欄位過濾 records 中昨日（Asia/Taipei）資料加總 spend。
- **本月配速**：重用 `aggregateAccounts`（`src/lib/initiatives/transform.ts:212`）— 月至今 spend、periodBudget、progress %。
- **ROAS / CPA**：昨日整體 revenue/spend、spend/conversions（無轉換時標示「—」，不除以零）。
- **異常清單**：重用 `checkRules`（`src/lib/alerts/rule-checker.ts:20`）結果帶入。
- 輸出 `DailySummary` type，供 Flex 組裝與 `/daily` 頁共用。

資料抓取範圍：一次 `fetchWindsor(buildAdPerformanceQuery("all", "last_60d"))` 同時涵蓋兩個需求 — 月配速需要本月 1 號至今（最長 31 天）、rule-checker 需要最近 8 天基期。60 天必然涵蓋，純函式端再按日期切分，不做第二次 API 呼叫。

### 5. 排程 job（`src/lib/cron/monitor-jobs.ts`）

- `runDailyDigestForAllUsers()`：撈出 `linePushEnabled=true` 且 lineChannelToken/lineRecipientId/windsorApiKey 齊全的使用者逐一處理；缺值使用者記 log「LINE 未設定，跳過」不 crash。
- `runAnomalyCheckForAllUsers()`：同上撈人；重用既有 alerts/check 的規則檢查＋台北時區每日去重邏輯（抽成 lib 函式讓 API route 與 cron 共用），**只有新觸發**（今日尚未通知過的規則）才推 LINE；同時照舊寫 AlertNotification 進 DB（通知鈴鐺同步有感）。
- 每個使用者用 try/catch 包裹，單人失敗記 log 繼續下一人。

### 6. `/daily` 行動摘要頁（`src/app/daily/page.tsx`）

- Client page，沿用既有 `useWindsorData` / `useAccountBudgets` hooks 模式與 `buildDailySummary` 純函式（同一份計算，LINE 卡與網頁數字保證一致）。
- 行動優先版面：單欄卡片流 — 今日日期、昨日花費大數字、配速進度條、ROAS/CPA 兩欄、異常清單、快速連結（/initiatives、/alerts）。
- 四狀態：loading skeleton、error（含重試鈕）、empty（未設 Windsor API Key 時導去 /settings）、success。
- 顏色一律用 token（`bg-accent`、`text-danger`…），配速紅黃綠沿用既有語意色。

### 7. PWA manifest

- `src/app/manifest.ts`（Next.js Metadata API）：name「Ad Manager Pro」、`start_url: "/daily"`、`display: "standalone"`、theme color 用品牌靛。
- icon：`src/app/icon.svg` 產 192/512 PNG（簡單靛底白字標誌即可）。
- 不做 service worker / 離線快取（YAGNI — 內容是即時數據，離線無意義）。

### 8. 設定頁 UI（`src/app/settings/` 既有頁加區塊）

- 「LINE 推播」區：Channel Access Token 輸入（密碼欄位、儲存後只顯示已設定狀態）、收件 ID 輸入、啟用開關、**「發送測試訊息」按鈕**（POST `/api/line/test`，用當前存的 token 推一則測試卡，回報成功/失敗）。
- `/api/line/test`：Clerk 認證 + Zod + 速率限制（比照既有高風險路由模式）。
- async 操作時禁用按鈕、結果 inline 顯示。

## 錯誤處理

| 情境 | 行為 |
|------|------|
| 使用者未設 LINE token/ID | job 記 log 跳過該使用者，不推播不 crash |
| LINE API 4xx/5xx/429 | 記 log（含 status 與 LINE 錯誤訊息），該使用者本輪放棄，不重試（下一輪排程自然再試） |
| Windsor 抓取失敗 | 同上，記 log 跳過 |
| Flex 組裝異常 | 退回純文字訊息 |
| ENCRYPTION_KEY 未設 | decrypt 拋錯 → 記 log 跳過該使用者 |

## 測試策略（TDD）

- `src/lib/digest/__tests__/build-daily-summary.test.ts` — 昨日過濾、配速、ROAS/CPA 除零、異常帶入。
- `src/lib/line/__tests__/flex.test.ts` — 摘要卡結構、紅黃綠門檻、警報卡、文字備援。
- `src/lib/line/__tests__/client.test.ts` — fetch mock：URL/header/body 正確、非 2xx 回結構化錯誤。
- `src/lib/cron/__tests__/monitor-jobs.test.ts` — 缺值跳過、單人失敗不中斷、新觸發才推播。
- 既有 241 測試不得變紅。

## 部署（Zeabur）

1. **build script 已是 `prisma generate && prisma db push && next build`（盤點確認 package.json 已修）**，若部署失敗再檢查。
2. Merge main → push GitHub → Zeabur auto-deploy。
3. 環境變數新增：`NEXT_PUBLIC_APP_URL`（LINE 卡片按鈕連結用）。既有 DATABASE_URL / CLERK / ENCRYPTION_KEY 不動。
4. 上線驗證：/daily 頁截圖、設定頁 LINE 區塊截圖、（憑證到位後）測試推播成功截圖。

## 使用者行動項（唯一卡人的環節）

LINE 憑證需使用者提供（我不經手憑證值，由你直接貼進部署後的設定頁）：

1. 開 plaisir 的 GAS 專案（script.google.com）→ 專案設定 → 指令碼屬性，抄出 `LINE_TOKEN` 與 `LINE_USER_IDS`（或 `LINE_GROUP_ID`）；或到 LINE Developers Console 同一 channel 重發 token。
2. 部署完成後，到 `{部署網址}/settings` 的「LINE 推播」區貼上 → 按「發送測試訊息」驗證。

系統設計為憑證後補式：沒填之前一切正常運作（排程跳過推播並記 log），填了即刻生效，無需重新部署。

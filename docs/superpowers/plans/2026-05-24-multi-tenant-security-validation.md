# 多租戶安全修補驗證計畫 — 2026-05-24

## 背景

2026-05-23 一次推進 8 個 commit 處理多租戶資料隔離與安全強化（含 1 個 CRITICAL）。每個 commit 都已附帶單元測試，但仍需一份**整合驗證清單**確保：

1. 上 production 前每個修補項都跑過至少 1 種驗證
2. 未被測試覆蓋的攻擊面被點名出來
3. 之後做新功能時不要回歸這些漏洞

## 範圍（8 個 commit）

| Commit | 主題 | Severity |
|--------|------|----------|
| `737bc88` | sync-notion 跨租戶資料洩漏修補 | 🔴 CRITICAL |
| `2508dda` | ENCRYPTION_KEY hex 64 字元解析強化 | 🟠 HIGH |
| `0d79abe` | rate-limit identifier 隔離 + leak 修補 | 🟡 MEDIUM |
| `ac945a3` | requireWindsorApiKey helper（412 統一） | 🟡 MEDIUM |
| `888ed64` | thresholds 巢狀 Zod schema | 🟡 MEDIUM |
| `9643075` | package-lock.json 同步 | 🟢 LOW |
| `d72e6db` | analyze 改用共用 mergeThresholds | 🟠 HIGH |
| `2f5369d` | sync-schedule updateScheduleRunTime userId where | 🔴 CRITICAL |

---

## 逐項驗證

### 🔴 1. `737bc88` — sync-notion 跨租戶資料洩漏

**改了什麼**
- 移除舊的 `src/lib/cron/sync-notion.ts`（會無區別跑所有 user 的同步）
- `/api/sync-notion` 改成只跑 **當前登入 user** 的同步
- 統一走 `job-executor.executeSyncForUser(userId)`

**驗證步驟**
- [ ] 用 user A 登入，按手動同步 → 確認**只有 A 的 Notion 資料庫被更新**
- [ ] 同時開 user B 的 session（另一瀏覽器） → 確認 B 的資料**沒有被 A 觸發的同步覆蓋**
- [ ] 看 `executeSyncForUser` 的 log，確認 settings 是該 user 的（不是讀環境變數共用）
- [ ] 確認 `src/lib/cron/sync-notion.ts` 已刪除（git: `ls src/lib/cron/sync-notion.ts` 應 404）

**Regression 測試現況**
- ✅ `job-executor.test.ts` 已加 203 行測試覆蓋 user-scoped 流程
- ⚠️ **未覆蓋**：API 層的 cross-tenant attack（用 A 的 session cookie 攻擊 B 的 userId）— 需要 integration test

**建議補測**
```ts
// src/app/api/sync-notion/__tests__/route.test.ts
it("rejects request when session userId is forged", async () => {
  // mock getCurrentUser 回 user A
  // body 帶 { targetUserId: "user-B" }
  // 預期：依然只同步 A 的資料，targetUserId 被忽略
});
```

---

### 🔴 2. `2f5369d` — sync-schedule updateScheduleRunTime userId where

**改了什麼**
- repository 改用 `updateMany + where: { id, userId }`，`count === 0` 時 throw
- job-executor 在 update 前驗 `schedule.id === scheduleId`，且使用查到的 `schedule.id`（而非 caller 傳入）

**驗證步驟**
- [ ] 跑 `npm test -- sync-schedule` 確認新測試（scheduleId/userId 不匹配的情境）綠燈
- [ ] 模擬攻擊：手動 call `updateScheduleRunTime("B-的-scheduleId", "A-的-userId", ...)` → 應 throw，不應寫到 B
- [ ] 看 production log 確認沒有 `Schedule not found or unauthorized` 之類的意外 throw（表示之前 caller 真有傳錯 pair）

**Regression 測試現況**
- ✅ 已加 29 行測試覆蓋不匹配情境

**建議補測**
- 無 — 已充分覆蓋

---

### 🟠 3. `2508dda` — ENCRYPTION_KEY 強化

**改了什麼**
- 64 字元 hex → AES-256-GCM 標準路徑
- 非 hex 但長度 >=32 → utf-8 fallback（**僅限非 production**）
- production 環境缺 key 或格式錯 → boot 時 throw

**驗證步驟**
- [ ] 在 production env 啟動前確認 `ENCRYPTION_KEY` 為 64 字元 hex（`openssl rand -hex 32`）
- [ ] 故意把 `ENCRYPTION_KEY` 改成 30 字元 → production 啟動應 throw（測 staging）
- [ ] 故意 unset `ENCRYPTION_KEY` → production 啟動應 throw
- [ ] 加密一筆 user setting（Windsor API Key）→ 重啟 server → 解密應成功（authTag 驗證通過）
- [ ] **跑兩次加密同一個 plaintext**，密文應不同（IV 隨機）

**Regression 測試現況**
- ✅ 15 個測試（兩種金鑰格式 / production throw / GCM authTag / 隨機 IV）

**建議補測**
- 無

**⚠️ 警示**：如果之前用的是非 hex utf-8 key，現在改 hex key 後**所有舊密文都會無法解密**。確認：
- [ ] 已寫 migration script 重新加密所有 user_settings 的 `windsorApiKey` / `notionApiKey`
- 或：保留 utf-8 fallback 但加 deprecation warning，分階段切換

---

### 🟡 4. `0d79abe` — rate-limit identifier 隔離

**改了什麼**
- `withRateLimit` 新增 `{ identifier }`，可用 user.id 隔離 bucket（NAT 友善）
- IP 識別優先 `x-real-ip`，退回 `x-forwarded-for` 取最後一段
- cleanup interval 改 `Symbol.for` 全域單例 + `.unref()` 避免 hot-reload leak
- 上限 `MAX_ENTRIES`

**驗證步驟**
- [ ] 同辦公室兩個人（同 NAT IP）連續按手動同步 → 應該**各自獨立計數**，不會互相 429
- [ ] 用同個 user 在不同分頁狂按 → 應該共用 bucket，超過 maxRequests 後 429
- [ ] `dev` 模式做 10 次 hot-reload → `ps` 看 node process 的 timer 數，不應線性增長
- [ ] 用同一個 IP 跑 10000+ 不同 user 模擬攻擊 → in-memory map 應在 `MAX_ENTRIES` 截斷，不該 OOM

**Regression 測試現況**
- ✅ 7 個測試（IP / identifier / x-forwarded-for / header 缺失）

**建議補測**
- ⚠️ **未覆蓋**：實際 production 流量下 `MAX_ENTRIES` 截斷時是否正確 evict 舊 entry（LRU? FIFO?）。值得實測。

---

### 🟡 5. `ac945a3` — requireWindsorApiKey helper

**改了什麼**
- 抽 `requireWindsorApiKey` 統一處理 auth + rate-limit + key 載入
- 4 條 Windsor 路由改用 helper（windsor / analyze / alerts/check / notion/report）
- 缺 key 統一回 **412 + code `WINDSOR_KEY_MISSING`**（原本 400）
- windsor/test 路由 auth 順序對齊其他

**驗證步驟**
- [ ] 用沒設 Windsor key 的 user 打 4 條路由 → **每條都回 412**，code 都是 `WINDSOR_KEY_MISSING`
- [ ] 用設好 key 的 user 打 4 條 → 200 / 200 / 200 / 200
- [ ] 前端如果有針對 400 做特殊處理（例如「重新登入」），改成 412 後**前端是否需要同步調整**？— 需確認

**Regression 測試現況**
- ✅ 5 個測試（412 / 成功 / 429 / per-user 隔離）

**建議補測**
- [ ] **前端 e2e**：把 user 的 Windsor key 在 DB 直接清掉，前端打開應顯示「請先設定 Windsor API Key」而非 generic error

---

### 🟡 6. `888ed64` — thresholds 巢狀 Zod schema

**改了什麼**
- thresholds.ts 用巢狀 Zod schema（strict + finite + nonnegative）
- strict 模式拒絕未知 key（防 prototype pollution）
- NaN / Infinity / 負值 → fallback 到 `DEFAULT_THRESHOLDS`
- `mergeThresholds` 對外回傳完整結構，避免 DB 殘留舊欄位 → 下游 NaN
- settings GET 用 `mergeThresholds` 補齊；PATCH 強制 merge 後寫 DB
- `dashboardVisibilitySchema` 限定已知 key
- production 不洩漏 `error.message`
- 前端 settings/page.tsx 再做一次 merge（defense-in-depth）

**驗證步驟**
- [ ] 在 settings 頁設一組 threshold（例如 `lowROAS: 2.0`）→ 重新整理 → 應持久化
- [ ] 用 SQL 把某 user 的 thresholds 改成**舊扁平結構** → 打 GET /api/settings → 應自動補齊 default，不該回 NaN
- [ ] 用 Postman 送 `{ thresholds: { __proto__: {} } }` → strict mode 應拒絕
- [ ] 送 `lowROAS: NaN` 或 `-1` → 應 fallback 到 DEFAULT，不該存進 DB
- [ ] production env 故意觸發 schema error → 回應**不應**有 `error.message` 細節

**Regression 測試現況**
- ✅ 9 個 mergeThresholds 測試

**建議補測**
- [ ] **DB migration**：撈一次所有 user 的 `thresholds` 欄位，跑 `mergeThresholds` 正規化後寫回。避免新舊結構共存導致每次讀取都要 fallback

---

### 🟠 7. `d72e6db` — analyze 改用共用 mergeThresholds

**改了什麼**
- `/api/analyze` 移除舊扁平 `thresholdsSchema`
- 改用 `src/lib/analysis/thresholds.ts` 的 `mergeThresholds`，與 `/api/settings` 對齊
- 對外回傳完整 `AnalysisThresholds` 結構

**驗證步驟**
- [ ] 在 settings 頁改 threshold → 進 analyze 頁 → **新 threshold 應生效**（之前會被靜默退回 default）
- [ ] 比對 `/api/settings` 與 `/api/analyze` 的 thresholds 結構應**完全相同**
- [ ] 看 production log 統計：修補後是否還有「使用者改了 threshold 但沒生效」的 user complaint？

**Regression 測試現況**
- ⚠️ 此 commit 沒附測試（commit message 沒提）— **建議補一個 integration test**

**建議補測**
```ts
// src/app/api/analyze/__tests__/route.test.ts
it("uses mergeThresholds (nested schema) consistently with /api/settings", async () => {
  // setup: user 在 DB 有完整巢狀 thresholds
  // call /api/analyze
  // assert response.thresholds 結構 === DEFAULT_THRESHOLDS 結構（key set 一致）
});
```

---

### 🟢 8. `9643075` — package-lock.json 同步

**改了什麼**
- transitive deps drift 同步

**驗證步驟**
- [ ] `npm ci` 應成功（不該 warning lockfile out of sync）
- [ ] `npm audit` 看新增的 transitive 是否帶進新漏洞

---

## 全域整合驗證（上 production 前）

### 必跑
- [ ] `npm test` 全綠（vitest）
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 全綠
- [ ] 用 production-like env（NODE_ENV=production + 真實 ENCRYPTION_KEY）啟動，確認不 throw

### 跨租戶整合驗收（模擬攻擊）
- [ ] 開兩個 user account（A、B）
- [ ] A 觸發手動同步 → B 的 Notion 不應被動到
- [ ] A 嘗試打 `/api/sync-schedule/{B-的-scheduleId}` → 應 401/403/404，不能 update
- [ ] A 嘗試打 `/api/analyze` 帶 `userId=B` query → 應忽略 query、用 session 的 A
- [ ] A 嘗試打所有 4 條 Windsor 路由帶 B 的 key → 應拒絕（key 應從 A 的 settings 載）

### 加密金鑰輪替
- [ ] 文件記下：若未來要輪替 `ENCRYPTION_KEY`，必須跑 migration 重加密所有 `user_settings.windsorApiKey` / `notionApiKey`
- [ ] 加 monitoring：production env 啟動時 log `ENCRYPTION_KEY` 的 hex prefix（前 4 字元），便於確認部署用的是正確 key

### Rate-limit 壓測
- [ ] 用 k6 / autocannon 對 `/api/sync-notion` 灌 100 RPS × 30 秒
  - 確認 429 比例符合預期
  - 確認 in-memory map 不會 OOM
  - 確認 hot-reload 後 timer 數不累積

---

## 已知缺漏（建議在下一個 session 處理）

| 缺漏 | 風險 | 建議行動 |
|------|------|----------|
| `737bc88` 缺 API-layer cross-tenant test | 🟠 HIGH — 攻擊者偽造 targetUserId | 補 integration test |
| `888ed64` 沒做 DB normalize migration | 🟡 MEDIUM — 新舊結構共存 | 寫 one-shot script |
| `ac945a3` 前端對 400 → 412 切換可能需配合 | 🟡 MEDIUM — UX regression | 前端 grep `status === 400` |
| `d72e6db` 沒附測試 | 🟡 MEDIUM — 容易回歸 | 補 integration test |
| 沒有 audit log | 🟡 MEDIUM — 出事查不到誰打了什麼 | 評估加 audit log middleware |

---

## 上線後監控

驗證完上線後，前 7 天每天看一次：
- [ ] 412 `WINDSOR_KEY_MISSING` 比例（突高 = 前端壞了或 user 真的沒設 key）
- [ ] 429 rate-limit 比例（突高 = 攻擊或 bug）
- [ ] sync 失敗率（跨租戶 throw 是否真的擋住可疑流量）
- [ ] `ENCRYPTION_KEY` 相關 throw（boot 失敗 = ENV 問題）

---

## 備註

- 本文件由 Meta Ad Planner session（2026-05-24）依 8 個 commit 推論產出，建議實際跑驗證時對照真實 code 再次確認
- adversarial review 似乎有獨立流程（commit message 提到「adversarial review 發現...」）— 那個流程的紀錄在哪？值得納入下次 session

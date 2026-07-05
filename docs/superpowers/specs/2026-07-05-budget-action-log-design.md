# 預算控管 × 操作紀錄結合（方案 B：自動偵測 + 待辦閉環）設計 spec

> 狀態：**待使用者 review**（方案 B 已選定，本文件為完整設計，review 後進 writing-plans）
> 產出：/loop 自主設計任務，2026-07-05
> 選型過程與 A/C 對照見文末附錄。

**Goal：** 讓 ad-manager-pro 自動記錄廣告帳戶的預算變更、偵測配速超支並提醒，形成「偵測 → 提醒 → 處理 → 留下操作紀錄 → 自動對帳」的預算待辦閉環，補上目前「改預算無痕覆寫、無操作紀錄、超支不告警」三個缺口。

**Architecture：** 三張新資料表（快照 / 變更歷史 / 預算待辦）＋一個獨立的配速超支檢查（不動既有 metric 規則引擎）＋掛進既有 cron 與 /daily、LINE 呈現。平台端預算變更靠比對 Windsor 每次拉到的 campaign budget 快照自動偵測；帳號月預算變更靠 PATCH 時 diff 寫入。**不含 Windsor 寫回**（那是 Phase 2 / 方案 C）。

**Tech Stack：** 沿用專案既有 — Next.js 16、Prisma 7、Windsor 唯讀資料層、node-cron in-app 排程、LINE Flex、Vitest。

## Global Constraints

- 顏色一律用設計 token（`bg-accent`/`text-muted`/`bg-info`…），禁硬色票；品牌/動作＝靛 `accent`，資訊＝藍 `info`，超支/危險＝`danger`。
- 幣別 TWD、時區 Asia/Taipei；金額用 `font-mono tabular-nums`。
- 所有新 API 路由沿用既有慣例：Zod 輸入驗證 + `getCurrentUser()` 認證。
- 不新增 Windsor 寫回。任何「調整預算」動作仍由使用者到平台手動執行。
- UI 四態（loading/error/empty/success）。

---

## 一、資料模型（3 張新表）

### BudgetSnapshot — 預算數值快照（供比對用，只留 latest）

```prisma
model BudgetSnapshot {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scope       String   // "campaign" | "account_monthly"
  platform    String   // meta, google（account_monthly 為 "manual"）
  entityKey   String   // campaign: campaignId 或正規化 campaignName；account_monthly: 帳號名
  entityLabel String   // 顯示用名稱
  budgetType  String   // "daily" | "lifetime" | "monthly_manual"
  budgetValue Float
  capturedAt  DateTime @default(now())

  @@unique([userId, scope, entityKey, budgetType])
  @@index([userId])
}
```

- 每個 (userId, scope, entityKey, budgetType) 只保留一筆（upsert 覆寫），角色是「上一次看到的值」。歷史落在 `BudgetChangeLog`。

### BudgetChangeLog — 預算變更歷史（缺口一的核心）

```prisma
model BudgetChangeLog {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  source        String   // "platform_detected" | "manual_account_budget"
  scope         String   // "campaign" | "account_monthly"
  platform      String
  entityKey     String
  entityLabel   String
  budgetType    String
  previousValue Float?   // 首見 baseline 時為 null（但 baseline 不寫本表，見比對邏輯）
  newValue      Float
  changePercent Float?
  note          String?  // 手動改月預算時可附備註
  detectedAt    DateTime @default(now())

  @@index([userId])
  @@index([detectedAt])
}
```

- 這張表回答「誰在何時把哪個帳號/campaign 的預算從多少改成多少」。

### BudgetActionItem — 預算待辦（閉環）

```prisma
model BudgetActionItem {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reason        String   // "pacing_overspend"（本期先只做這一種）
  platform      String   // all/meta/google（帳號層通常 all）
  accountName   String
  severity      String   // "warning" | "critical"
  detail        Json     // { monthSpend, periodBudget, pacingRatio, monthlyBudget }
  status        String   @default("open") // "open" | "resolved" | "dismissed"
  resolvedBy    String?  // "auto_detected_change" | "manual"
  linkedChangeLogId String? // 自動對帳時關聯到的 BudgetChangeLog
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

需在 `User` model 補三個反向關聯（`budgetSnapshots` / `budgetChangeLogs` / `budgetActionItems`）。

---

## 二、配速超支檢查（缺口二，獨立於既有 metric 規則）

**為何獨立：** 既有 `rule-checker.ts` 是「最近一天 vs 前 7 天平均」的 day-over-day 門檻，配速超支比的是「當月累計花費 vs 月預算的當期應花額度」，時間視窗與語意都不同，硬塞 metric 會很彆扭。故做成獨立函式。

**演算法**（複用 `transform.ts:265` 既有換算）：
- 期間預算 `periodBudget = 月預算 ÷ 當月天數 × 已過天數`（含今日）
- 當月累計花費 `monthSpend`（Windsor 抓當月）
- 配速比 `pacingRatio = monthSpend / periodBudget`
- 超支門檻（預設，可設）：`pacingRatio > 1.10` → 生成 `BudgetActionItem`
  - `1.10 < ratio ≤ 1.25` → severity `warning`
  - `ratio > 1.25` → severity `critical`
- 僅對「有設月預算」的帳號檢查（無月預算跳過）。

**去重：** 同一帳號、reason=pacing_overspend、status=open 已存在時不重複生成（更新 detail/severity 即可）。狀態轉 resolved/dismissed 後若再次超支才生新的。

**掛載點：** 既有 cron 每日 08:30 摘要流程（`monitor-jobs.ts` 每日摘要那次）跑一次配速檢查。盤中不重複跑配速（配速一天內變化小，日檢足夠；避免盤中吵）。

---

## 三、快照比對與自動偵測（平台端變更）

**掛載點：** 每日摘要抓數據那次（一天一次），拉到各 campaign 的 `daily_budget`/`lifetime_budget`（`queries.ts:74` 已在拉）。

**比對邏輯：**
1. 對每個 campaign 的每種 budgetType，查 `BudgetSnapshot`。
2. **無快照**（首見）→ 建立 baseline snapshot，**不寫 ChangeLog**（避免首次全部誤報為變更）。
3. **有快照且值不同** → 寫一筆 `BudgetChangeLog(source=platform_detected, previous, new, changePercent)`，更新 snapshot。
4. **值相同** → 不動。

**自動對帳（閉環關鍵）：** 寫入 ChangeLog 後，查該帳號是否有 open 的 `BudgetActionItem`；若有 → 標 `resolved(resolvedBy=auto_detected_change, linkedChangeLogId)`。語意：「系統偵測到你在平台調了這個帳號的預算，視為你已處理該待辦」。

**帳號月預算變更（缺口一直接補）：** 在 `PATCH /api/settings` 改 `accountBudgets` 時（`settings/route.ts:199`），diff 新舊值，對每個變動帳號寫 `BudgetChangeLog(source=manual_account_budget, note?)`，並同步更新 account_monthly 快照。

---

## 四、呈現層

**/daily 新增兩個區塊：**
- 「預算待辦」：列 open 的 `BudgetActionItem`（帳號、配速%、花費/期間預算、severity 色）。每筆可「標記已處理」(manual resolve) 或「忽略」(dismiss)。empty 態顯示「目前沒有需要處理的預算」。
- 「近期預算變更」：`BudgetChangeLog` 時間軸（近 N 筆），區分平台偵測 vs 手動改月預算，顯示 previous→new 與時間。

**LINE：**
- 每日摘要 Flex（`flex.ts:135`）加一行「⚠️ N 筆預算待處理」，按鈕連回 `/daily`（`NEXT_PUBLIC_APP_URL` 已設）。
- 盤中：新生成的 critical `BudgetActionItem` 可即時推播（沿用既有推播管道；當日同帳號同 reason 只推一次）。warning 只進每日摘要不即時吵。

**API 路由（新增）：**
- `GET /api/budget/action-items`（列 open/近期）
- `PATCH /api/budget/action-items/[id]`（resolve/dismiss，Zod + auth）
- `GET /api/budget/change-log`（近期變更，分頁）

---

## 五、測試策略（Vitest，沿用 lib 層測試慣例）

- `pacing-check`：邊界（ratio 剛好 1.10 / 1.25）、無月預算跳過、severity 分級、去重不重複生成。
- `snapshot-diff`：首見建 baseline 不誤報、值變更寫 ChangeLog、值相同不動、changePercent 計算。
- `auto-reconcile`：偵測到平台變更 → 對應 open item 自動 resolved 並帶 linkedChangeLogId。
- `account-budget-changelog`：PATCH diff 多帳號增/改/刪各寫正確 ChangeLog。

---

## 六、決策點（已定案 2026-07-05，全數採預設）

1. **配速超支門檻**：`pacingRatio > 1.10` warning、`> 1.25` critical。✅ 採預設。
2. **快照頻率**：跟每日 08:30 摘要綁，一天一次。✅ 採預設。
3. **操作紀錄範圍**：本期只記「預算數字變更」（不含暫停/開啟 campaign，留 Phase 2）。✅ 採預設。
4. **待辦 reason 類型**：本期只做 `pacing_overspend`（不含預算見底/花費驟降，留擴充）。✅ 採預設。

---

## 附錄：選型過程（A / B / C 對照）

| 面向 | A 手動打勾 | **B 自動偵測（採用）** | C 寫回中心 |
|---|---|---|---|
| 補缺口一（操作紀錄） | 靠自律易落空 | ✅ 自動記錄 | ✅ 最準（系統執行） |
| 補缺口二（超支規則） | ✅ | ✅ | ✅ |
| 補缺口三（寫回閉環） | ✗ 人手 | ✗ 人手但自動對帳 | ✅ 一鍵寫回 |
| 實作量 | 小(~1週) | 中(1 plan) | 大(含高風險寫回) |
| 風險 | 低 | 低 | 高（動客戶的錢） |

**採用 B 的理由：** 精準補最痛的缺口一，閉環自動化足夠，不碰「動客戶錢」的高風險寫回（留給 Phase 2 = 方案 C）。A 靠自律紀錄會空；C 風險與複雜度跳一級，應待 B 上線驗證後再做。

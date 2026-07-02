# 行銷活動總覽頁 設計規格

- 日期：2026-07-02
- 狀態：設計定案，待寫實作計畫
- 相關現有頁：`/campaigns`（個別 campaign 表）、`/dashboard`

## 1. 目標

新增一個「行銷活動」層級的總覽頁，把同一個廣告帳號下、campaign 名稱**第一個 `_` 之前的前綴**相同的 campaign 合併成一個「行銷活動」，顯示每個活動的：**花費、預算、進度、ROAS、CPA**。

與現有 `/campaigns` 的差異：`/campaigns` 以完整 campaign 名稱逐一列出；本頁把 campaign 上捲一層成「活動」，並多了預算 / 進度概念。

## 2. 分組邏輯（核心）

活動 key = **帳號 + 前綴**，缺一不可（避免不同客戶帳號的同名活動誤併）。

```
prefix   = campaign 名稱以第一個 "_" 切開後的第 0 段
activityKey = `${account_name}:::${prefix}`
```

| account_name | campaign 名稱 | prefix | 說明 |
|---|---|---|---|
| 魔幻主義 | `夏季購物_轉換_v2` | 夏季購物 | |
| 魔幻主義 | `夏季購物_觸及` | 夏季購物 | 與上列合併 |
| Plaisir | `夏季購物_轉換` | 夏季購物 | **不**與魔幻主義合併（帳號不同）|
| 魔幻主義 | `品牌日` | 品牌日 | 無底線 → 整串當前綴，自成一活動 |

邊界情況：
- campaign 為空字串 → prefix = `未命名`
- campaign 以 `_` 開頭（prefix 為空）→ 退回用完整 campaign 名當 prefix
- account_name 為空 → `未命名帳戶`（沿用 `ad-structure/transform.ts` 既有慣例）

## 3. 指標算法

| 指標 | 算法 | 注意 |
|---|---|---|
| 花費 spend | Σ 各 record.spend | 可加總 |
| 營收 revenue | Σ 各 record.revenue | 可加總 |
| 轉換 conversions | Σ 各 record.conversions | 可加總 |
| ROAS | Σrevenue / Σspend | **加權**，非各 row 平均 |
| CPA | Σspend / Σconversions | conversions=0 時顯示 `—` |
| 預算 budget | 見下節 | **不可**跨日 row 加總 |
| 進度 progress | spend / budget | 有 budget 才顯示進度條 |

## 4. 預算來源：混合制（自動優先）

Windsor facebook connector 已確認有這些欄位（`get_fields` 驗證）：
`campaign_lifetime_budget`、`campaign_daily_budget`、`campaign_budget_remaining`、以及 adset 版本（`adset_lifetime_budget` 等，供 ABO 使用）。

### 4.1 預算聚合規則（重要）
預算欄位是「當前設定值快照」，Windsor 每日 row 會重複帶同一值 → **不可像花費那樣 Σ**。正確做法：

1. 先把活動內的 record 依 campaign 分組
2. 每個 campaign 取其預算快照（同一 campaign 跨日取最新/最大值即可，值相同）
3. 活動總預算 = 各 campaign 快照**跨 campaign 加總**

### 4.2 三種情況
- **有 lifetime 總預算的活動**：活動總預算 = Σ 各 campaign 的 lifetime budget → `進度 = 花費 / 總預算`。**零維護，Meta 改預算自動同步**。
- **只有 daily 日預算的活動**：平台無規劃總額 → 不顯示總進度條，改顯示「日預算 $X/天」燒錢速率 chip；若使用者有填手動總額則改用手動總額算進度。
- **手動覆寫**：使用者可為任一活動填「規劃總額 + 起訖日」，**優先於自動值**，並解鎖「時間進度 vs 預算進度」的超支/低消判斷。

### 4.3 時間進度（pacing）
僅在「有手動起訖日」時計算：
```
時間進度 = (今日 - startDate) / (endDate - startDate)
落差判斷：預算進度 - 時間進度
  > +15%  → 燒太快（可能提前燒完）
  < -15%  → 投放不足（時間快到但沒花完）
  其餘     → 正常
```
自動路徑（Meta lifetime）不含時間進度，因平台未穩定提供規劃排程。

> 目前 Windsor 只接 Meta（9 個 FB 帳號），未接 Google Ads → 自動抓預算第一版僅 Meta。

## 5. 版面（方案 A：KPI 卡 + 依帳號分群的活動表）

```
┌ Header（日期範圍 / 平台 / 帳號篩選）─────────────┐
├ KPI 卡：總花費 | 總預算 | 整體 ROAS | 整體 CPA ──┤
├ 活動表（依帳號分群）───────────────────────────┤
│  ▸ 魔幻主義                                      │
│    夏季購物   [████░░ 62%]  花費 ROAS CPA ⚙      │
│    品牌日     [██░░░░ 30%]  ...                   │
│  ▸ Plaisir                                       │
│    夏季購物   日預算$500/天  ...                  │
└──────────────────────────────────────────────┘
```
- 表格列＝一個活動，含預算進度條（顏色：正常/燒太快/低消用語意色 token）
- 每列可展開 → 顯示底下實際 campaign 明細（沿用個別 campaign 指標）
- 每列 ⚙ 開啟「編輯活動預算」小面板（填規劃總額 + 起訖日）
- 帳號篩選：從資料的 distinct `account_name` 動態產生
- 排序：花費 / ROAS / CPA / 進度
- 四種狀態：loading（初次 spinner）、error、empty（無資料）、success（沿用 UI 慣例）

## 6. 資料模型（Prisma 新增）

```prisma
model InitiativeBudget {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountName   String    // 綁帳號
  prefix        String    // 活動前綴
  plannedBudget Float?
  startDate     DateTime?
  endDate       DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([userId, accountName, prefix])
  @@index([userId])
}
```
（User model 需加對應 `initiativeBudgets InitiativeBudget[]` 關聯。）

## 7. 元件與檔案

| 檔案 | 職責 |
|---|---|
| `src/lib/initiatives/transform.ts` | 純函式：`initiativeKey()`、`aggregateInitiatives(records, overrides)` → `InitiativeRow[]`。**單元測試覆蓋** |
| `src/lib/initiatives/types.ts` | `InitiativeRow`、pacing 狀態型別 |
| `src/components/initiatives/initiative-kpi-cards.tsx` | 頂部總覽卡 |
| `src/components/initiatives/initiative-table.tsx` | 依帳號分群表 + 進度條 + 展開 + 編輯入口 |
| `src/components/initiatives/budget-edit-panel.tsx` | 編輯活動預算面板 |
| `src/app/initiatives/page.tsx` | 頁面（loading/error/empty/success 四狀態）|
| `src/app/api/initiatives/budget/route.ts` | 手動覆寫 CRUD（GET/POST/DELETE），含 `getCurrentUser()` + Zod + 速率限制 |
| `src/lib/windsor/queries.ts` | 新增 `buildInitiativeQuery`（AD_PERFORMANCE_FIELDS + Meta 預算欄位）|
| `src/lib/windsor/types.ts` | `WindsorAdRecord` 加預算欄位 + `normalizeRecord` 對應 |
| `src/app/api/windsor/route.ts` | 支援 `level=initiative` |
| `src/components/layout/sidebar.tsx` | 加導覽項「行銷活動」→ `/initiatives` |

預算欄位為 Meta 特有 → 只在 `buildInitiativeQuery` 加入，不動既有 `AD_PERFORMANCE_FIELDS`，避免 google_ads 查詢帶到不存在欄位。

## 8. 測試（Vitest，沿用現有設定）

`src/lib/initiatives/__tests__/transform.test.ts`：
- 前綴解析：多底線、無底線、開頭底線、空字串
- 帳號隔離：同前綴不同帳號不合併
- 加權 ROAS / CPA 正確；conversions=0 的 CPA
- 預算快照聚合：跨日不重複加總、跨 campaign 加總
- pacing 落差判斷三段（正常 / 燒太快 / 低消）
- 手動覆寫優先於自動值

## 9. 分期（供實作計畫排序）

- **P1（先上線）**：分組 + 花費/ROAS/CPA 活動表 + 帳號篩選 + KPI 卡 + Meta lifetime 自動進度條（daily 顯示速率 chip）。無 DB、無手動覆寫。
- **P2**：`InitiativeBudget` 資料表 + 手動覆寫 CRUD + 編輯面板 + 時間進度 pacing 判斷。

## 10. 非目標（YAGNI）

- 不做 Google Ads 預算（未接）
- 不做活動層級的趨勢圖（第一版）
- 不改動現有 `/campaigns` 頁
- 不做跨帳號合併同名活動

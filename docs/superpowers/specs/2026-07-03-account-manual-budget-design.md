# 帳號手動月預算 設計文件

日期：2026-07-03
狀態：待使用者審查

## 背景與問題

/initiatives 帳號卡的期間預算來自 Windsor API 的 **campaign 層級**欄位
（`campaign_daily_budget` / `campaign_lifetime_budget` / `campaign_status`）。
實際資料顯示大部分帳號採 Meta ABO（預算設在廣告組合層），campaign 層預算為
null，導致卡片顯示「無進行中預算」、無法計算配速 %。

使用者選定的解法：讓使用者為每個廣告帳號**手動填寫月預算**（存 DB），
以委刊預算作為配速監控基準。

## 已確認決策

1. **月預算 → 期間預算換算**：日預算 = 月預算 ÷ 當月天數（Asia/Taipei
   當下月份），期間預算 = 日預算 × 期間天數（沿用 `countDistinctDates`
   的不重複日期數）。任何日期範圍都能算 %，不需額外查詢。
2. **覆寫規則：手動優先**。帳號有手動月預算 → 一律用手動值算 %，
   忽略 API 推算值；沒填 → 沿用現有 API 邏輯（ACTIVE 日預算 × 天數
   ＋ lifetime 直計）。清除手動值即回到 API 邏輯。
3. **填寫位置：帳號卡就地編輯**（使用者暫離，依推薦預設採用；審查時可改）。
   /initiatives 帳號卡 hover 顯示鉛筆鈕，點開就地輸入、存檔。
   不做設定頁集中管理區塊。
4. **儲存：`UserSettings.accountBudgets Json?`**，結構
   `{ [accountName: string]: number }`。沿用 `thresholds Json?` 先例，
   免新表。值為該帳號**原幣別**金額，不做幣別換算（與現有花費顯示一致）。

## 架構

### 資料模型（Prisma）

`UserSettings` 加一欄：

```prisma
accountBudgets Json?
```

不需 migration 檔（專案用 `prisma db push`）。

### API（擴充 `/api/settings`）

- **GET**：回傳 `accountBudgets`（物件；未設定時為 `{}`）。
- **PATCH**：接受 `accountBudgets`，**merge 語意**——只更新送來的
  key；值為 `null` 時刪除該 key；未送的 key 不動。
- Zod 驗證：`z.record(z.string().min(1).max(200), z.number().positive().max(1e9).nullable())`，
  整個物件選填。
- 認證、錯誤處理、遮罩慣例沿用現有 route 寫法。

### 計算層（`src/lib/initiatives/transform.ts`）

`aggregateAccounts` 加選填第三參數：

```ts
export interface AccountBudgetOptions {
  /** 帳號名稱 → 手動月預算（原幣別） */
  manualBudgets: Record<string, number>;
  /** 當月天數（呼叫端以 Asia/Taipei 當下月份計算） */
  daysInMonth: number;
}

export function aggregateAccounts(
  records: WindsorAdRecord[],
  days: number,
  budgetOptions?: AccountBudgetOptions,
): AccountSummary[]
```

彙總每個帳號後：

- 若 `manualBudgets[accountName] > 0` 且 `daysInMonth > 0`：
  `periodBudget = (monthlyBudget / daysInMonth) * days`、
  `hasBudget = true`、`budgetSource = "manual"`、
  `monthlyBudget = manualBudgets[accountName]`。
- 否則走現有 API 邏輯，若 `periodBudget > 0` 則 `budgetSource = "api"`。

`AccountSummary` 型別新增：

```ts
/** 預算來源：manual = 手動月預算換算；api = 平台預算推算；無預算時 undefined */
budgetSource?: "manual" | "api";
/** 手動月預算原始值（budgetSource === "manual" 時存在） */
monthlyBudget?: number;
```

### 前端

**資料流（`src/app/initiatives/page.tsx`）**：

- 新 hook `useAccountBudgets()`（放 `src/hooks/`）：GET `/api/settings`
  取 `accountBudgets`，回傳 `{ budgets, saveBudget(accountName, value | null), saving, error }`；
  `saveBudget` 以 PATCH merge 語意送單一 key，成功後更新本地狀態。
- `daysInMonth` 於頁面以 `new Date()`（使用者本地時區 ≒ Asia/Taipei）
  計算當月天數，傳入 `aggregateAccounts`。
- budgets 載入完成前先用空物件計算（顯示與現狀相同），載入後重算——
  不阻塞主資料呈現。

**帳號卡（`src/components/initiatives/account-pacing-cards.tsx`）**：

- 卡片 hover 顯示鉛筆小鈕；`onClick` 需 `stopPropagation`，
  避免觸發既有「點卡片切換帳號篩選」。
- 點鉛筆 → 卡片內就地顯示數字輸入框 + 存檔/取消鈕；
  已有手動值時預填並提供「清除」（送 null 回到 API 邏輯）。
- async 儲存期間按鈕 disabled；失敗時卡片內 inline 顯示錯誤文字
  （用 `text-danger` token）；成功後關閉編輯並即時反映新 %。
- `budgetSource === "manual"` 的卡片在金額行下加小字
  「月預算 $X」（`text-muted`），標示 % 的基準是委刊預算。
- 輸入驗證：正數、上限 1e9；空值視為取消。

**UI 狀態**：loading（budgets 載入中不擋卡片渲染）、error（inline）、
empty（無手動值 = 現狀）、success（即時重算 %）。
顏色一律用 token，禁止硬寫色票。

### KPI 卡連動

KPI「期間預算」彙總 `accountSummaries`，手動值自動計入，
與帳號卡同基準，無需改動 `initiative-kpi-cards.tsx`。

## 錯誤處理

- PATCH 失敗（網路/500）：卡片 inline 錯誤，輸入值保留可重試。
- Zod 拒絕（負數、超長 key）：回 400，前端顯示驗證錯誤。
- `daysInMonth` 異常（≤ 0）：防除以零，落回 API 邏輯。

## 測試（Vitest，TDD）

**transform（`src/lib/initiatives/__tests__/` 既有測試檔延伸）**：

1. 手動值覆寫：帳號有 API 預算（ACTIVE 日預算）＋手動月預算 →
   用手動值換算，`budgetSource === "manual"`。
2. 手動值補位：帳號無任何 API 預算＋手動月預算 → `hasBudget = true`。
3. 回退現狀：無手動值 → 結果與未傳 `budgetOptions` 完全相同，
   `budgetSource === "api"`（有 API 預算時）。
4. 換算數學：月預算 31000、`daysInMonth = 31`、`days = 7` →
   `periodBudget = 7000`。
5. 防呆：`daysInMonth = 0` → 落回 API 邏輯。

**settings route schema**：

6. `accountBudgets` 負數 / 值超過 1e9 / key 超長 → 拒絕。
7. 值 `null` → 刪除該 key；未送 key 不動（merge 語意）。

## 明確不做（YAGNI）

- 多幣別換算（填原幣別，與花費顯示一致）。
- 固定月視角累計（本月花費 vs 月預算）——需額外查詢且卡片語意分裂。
- 設定頁集中管理區塊。
- 改用帳號 ID 當 key——現有全鏈路（篩選、彙總、卡片）都以
  `account_name` 為鍵，維持一致。**已知限制**：平台上改帳號名稱後
  手動預算會斷連，需重填。
- 行銷活動（initiative）層級的手動預算——只做帳號層。

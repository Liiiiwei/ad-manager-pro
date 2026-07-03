# /initiatives 預算進度優化設計

日期：2026-07-03
狀態：已與使用者確認設計，待實作

## 背景與問題

使用者需要「用百分比跟顏色快速掌握每個廣告帳號的預算花費進度」。現況的根本問題：P1 的預算進度只用 `campaign_lifetime_budget` 計算，但實際帳戶的活動幾乎全是日預算（lifetime 預算為 0），導致：

- KPI 卡「總預算」永遠顯示「—」
- 活動列大多只有藍色「日預算 $X/天」chip，沒有進度百分比
- 帳號分組列只有花費總額，完全沒有預算對照

解法核心：**用「日預算 × 期間天數」推算期間預算**，讓 KPI 卡 → 帳號 → 活動列整條鏈都有 % 和顏色。

## 已確認的產品決策

1. **帳號期間預算** = Σ（ACTIVE 活動日預算）× 期間天數；進度 = 實際花費 ÷ 期間預算
2. **暫停活動**：不計入預算分母（只加總 ACTIVE 活動日預算），但花費照計（含已暫停活動的花費）
3. **雙向三色門檻**：
   - 85%～110% → 健康（`success` 綠）
   - 70%～85%、110%～120% → 注意（`warning` 黃）
   - <70%、>120% → 嚴重偏離（`danger` 紅）
4. **呈現方式**：帳號卡片區（表格上方）＋ 升級表格帳號分組列，兩者並行
5. **活動列雙軌語意**：日預算活動用雙向配速色；lifetime 預算活動維持單向消耗色（滿了才紅），因 lifetime 是總額非配速
6. **KPI 整體達成率的分子範圍**：分子 = 全部帳號花費（含無預算帳號），分母 = 有預算帳號的期間預算加總。與決策 2「暫停活動花費照計、不計分母」哲學一致——花費是事實全計，預算只計可歸因者；非 bug

## 第 1 節：資料層（`src/lib/initiatives/transform.ts` 擴充）

### 期間天數

從撈回的 `WindsorAdRecord[]` 取**不重複日期數**當期間天數。含今天時當天花費未跑完、進度會略偏低，屬可接受誤差。

### 活動狀態追蹤

`aggregateInitiatives` 的 `CampaignAcc` 目前不記錄狀態。擴充：每個 campaign 累加器記下「最新日期那筆的 `campaignStatus`」——狀態期間有變時以最近狀態為準。`InitiativeCampaign` 型別加 `status: string` 欄位。

### 帳號聚合（新函式 `aggregateAccounts`）

輸入 `WindsorAdRecord[]`，輸出 `AccountSummary[]`：

```
AccountSummary {
  accountName: string
  platform: string
  spend: number            // 全部活動花費（含已暫停）
  periodBudget: number     // Σ(ACTIVE 活動日預算) × 天數；lifetime 活動改以 lifetime 金額計入（不乘天數）
  hasBudget: boolean       // periodBudget > 0
  progress: number         // hasBudget ? spend / periodBudget : 0
}
```

規則：

- 日預算取每活動期間內的 `Math.max` 快照（與既有預算快照語意一致，勿跨日加總）
- 活動同時有 lifetime 與日預算時，以 lifetime 為準（總額上限比推算值可信）
- `periodBudget = 0` 的帳號 `hasBudget = false`，UI 顯示「無進行中預算」灰色，不給 %

### 雙向三色判定（新 helper `pacingLevel`）

```
pacingLevel(progress: number): "good" | "warn" | "bad"
```

邊界含入規則：`0.85 ≤ p ≤ 1.10` → good；`0.70 ≤ p < 0.85` 或 `1.10 < p ≤ 1.20` → warn；其餘 → bad。

對應 token：good → `success`、warn → `warning`、bad → `danger`。禁止硬寫色票。

## 第 2 節：帳號卡片區（新元件 `AccountPacingCards`）

- 位置：KPI 卡下方、表格上方
- 每帳號一張緊湊卡：帳號名、達成率大字（`font-mono tabular-nums`＋三色）、色帶進度條（寬度封頂 100%，超過時標示溢出）、`花費 / 期間預算`（formatCurrency）
- 排序：依花費由高到低
- 互動：點卡片切換「只看該帳號」篩選表格；再點同一張取消篩選
- 四狀態：loading 用骨架卡；error 沿用頁面既有錯誤區；所有帳號皆無進行中預算時整區收合成一行提示；success 正常顯示
- `hasBudget = false` 的帳號卡：只顯示帳號名＋花費＋「無進行中預算」灰字，不顯示 % 與進度條

## 第 3 節：表格與 KPI 升級（`initiative-table.tsx`、`initiative-kpi-cards.tsx`）

- **帳號分組列**：右側加 `花費/期間預算 · 96% ●`（三色圓點＋數字上色）；無預算帳號維持只顯示花費
- **活動列 BudgetCell**：
  - 只有日預算的活動 → 期間預算 = 日預算 × 天數，顯示進度條＋%，用雙向三色（`pacingLevel`）；日預算金額縮成小字附註
  - 有 lifetime 預算的活動 → 維持現有單向消耗語意（≥100% 紅、≥90% 黃、其餘 accent）
  - 兩者皆無 → 維持「—」
- **排序**：接上已宣告但未實作的 `progress` 排序（依達成率），快速找偏離的活動
- **KPI 卡「總預算」→「期間預算」**：Σ 各帳號 `periodBudget`，副標顯示整體達成率＋三色
- **Token 清理（僅此頁）**：分組列 `bg-gray-50/60`、hover `bg-gray-100` 等硬寫色票換成 slate token（依 DESIGN.md）

## 第 4 節：錯誤與邊界處理

- 期間天數為 0（無資料）→ 不計算期間預算，頁面沿用既有空狀態
- `spend > 0` 且 `periodBudget = 0` → 顯示花費＋「無進行中預算」，不算 %（避免除以零）
- 進度超過 100% → 進度條封頂、百分比照實顯示（如 137%）
- 幣別：所有金額已在 `normalizeRecord` 統一換算 TWD，本功能不需再處理幣別

## 第 5 節：測試（TDD，Vitest）

transform 層全走 red → green：

1. 狀態追蹤：同活動多日狀態變化取最新日期狀態
2. 天數推導：不重複日期數
3. 帳號聚合：ACTIVE-only 分母、暫停活動花費仍計入、lifetime 混合（lifetime 優先且不乘天數）、日預算 Math.max 快照
4. `pacingLevel` 邊界值：0.699 / 0.70 / 0.85 / 1.10 / 1.20 / 1.201
5. 無預算帳號：`hasBudget = false`、`progress = 0`

UI 元件依專案既有模式手動驗證（無元件測試基礎建設，不在此次擴充）。

## 不做的事（YAGNI）

- 不做自訂門檻設定介面（門檻寫死於 helper，改動走程式碼）
- 不做每帳號幣別顯示切換（統一 TWD）
- 不動其他頁面的 token 清理
- 不做帳號卡的趨勢小圖

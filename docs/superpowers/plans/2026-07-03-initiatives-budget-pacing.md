# /initiatives 預算配速優化實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 /initiatives 頁用「日預算 × 期間天數」推算期間預算，讓 KPI 卡、帳號卡片區、表格分組列與活動列全部有達成率百分比＋雙向三色。

**Architecture:** 資料層在 `src/lib/initiatives/` 擴充（狀態追蹤、天數推導、帳號聚合、配速三色 helper），全走 TDD；UI 層新增帳號卡片元件、升級既有表格與 KPI 卡，沿用頁面既有的 loading / error / empty 機制與帳號篩選 state。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS 4（語意 token）、Vitest。

**Spec:** `docs/superpowers/specs/2026-07-03-initiatives-budget-pacing-design.md`

## Global Constraints

- 程式碼註解一律繁體中文；UI 文案繁體中文
- 顏色一律用語意 token（`bg-accent`、`text-success`、`bg-background`…），禁止硬寫色票（`bg-blue-500`、`bg-slate-50`）
- 數字一律 `font-mono tabular-nums`
- Commit 用 Conventional Commits，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 分支：`vs/initiative-view`（已存在，直接沿用）
- 測試指令：`npx vitest run <path>`；全套驗證：`npm test`、`npx tsc --noEmit`、`npm run lint`
- 雙向三色門檻（含入規則）：`0.85 ≤ p ≤ 1.10` → good；`0.70 ≤ p < 0.85` 或 `1.10 < p ≤ 1.20` → warn；其餘 → bad

---

### Task 1: 配速三色 helper `pacingLevel`

**Files:**
- Create: `src/lib/initiatives/pacing.ts`
- Test: `src/lib/initiatives/__tests__/pacing.test.ts`

**Interfaces:**
- Consumes: 無（純函式）
- Produces: `type PacingLevel = "good" | "warn" | "bad"`、`pacingLevel(progress: number): PacingLevel`、`PACING_TEXT: Record<PacingLevel, string>`（文字色 token）、`PACING_BG: Record<PacingLevel, string>`（背景色 token）。Task 6、7、8 的 UI 直接 import 這些。

- [ ] **Step 1: 寫失敗測試**

```typescript
// src/lib/initiatives/__tests__/pacing.test.ts
import { describe, it, expect } from "vitest";
import { pacingLevel, PACING_TEXT, PACING_BG } from "../pacing";

describe("pacingLevel 雙向三色門檻", () => {
  it("85%～110% 為 good（含邊界）", () => {
    expect(pacingLevel(0.85)).toBe("good");
    expect(pacingLevel(1.0)).toBe("good");
    expect(pacingLevel(1.1)).toBe("good");
  });

  it("70%～85% 為 warn（低於配速的注意帶）", () => {
    expect(pacingLevel(0.7)).toBe("warn");
    expect(pacingLevel(0.84)).toBe("warn");
  });

  it("110%～120% 為 warn（超支的注意帶）", () => {
    expect(pacingLevel(1.11)).toBe("warn");
    expect(pacingLevel(1.2)).toBe("warn");
  });

  it("低於 70% 為 bad", () => {
    expect(pacingLevel(0.699)).toBe("bad");
    expect(pacingLevel(0)).toBe("bad");
  });

  it("超過 120% 為 bad", () => {
    expect(pacingLevel(1.201)).toBe("bad");
    expect(pacingLevel(2)).toBe("bad");
  });
});

describe("token 對應表", () => {
  it("三個等級都有文字色與背景色 token", () => {
    expect(PACING_TEXT.good).toBe("text-success");
    expect(PACING_TEXT.warn).toBe("text-warning");
    expect(PACING_TEXT.bad).toBe("text-danger");
    expect(PACING_BG.good).toBe("bg-success");
    expect(PACING_BG.warn).toBe("bg-warning");
    expect(PACING_BG.bad).toBe("bg-danger");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/pacing.test.ts`
Expected: FAIL — `Cannot find module '../pacing'`（或同義的模組不存在錯誤）

- [ ] **Step 3: 最小實作**

```typescript
// src/lib/initiatives/pacing.ts
/** 預算配速等級（雙向三色）：健康 / 注意 / 嚴重偏離 */
export type PacingLevel = "good" | "warn" | "bad";

/**
 * 雙向三色配速判定（progress = 花費 ÷ 期間預算）：
 * - 85%～110% → good（健康）
 * - 70%～85%、110%～120% → warn（注意）
 * - <70%、>120% → bad（嚴重偏離）
 */
export function pacingLevel(progress: number): PacingLevel {
  if (progress >= 0.85 && progress <= 1.1) return "good";
  if (progress >= 0.7 && progress < 0.85) return "warn";
  if (progress > 1.1 && progress <= 1.2) return "warn";
  return "bad";
}

/** 等級 → 文字顏色 token */
export const PACING_TEXT: Record<PacingLevel, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
};

/** 等級 → 進度條 / 圓點背景 token */
export const PACING_BG: Record<PacingLevel, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
};
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/pacing.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/pacing.ts src/lib/initiatives/__tests__/pacing.test.ts
git commit -m "feat(initiatives): 雙向三色配速判定 helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 期間天數推導 `countDistinctDates`

**Files:**
- Modify: `src/lib/initiatives/transform.ts`（檔尾新增函式）
- Test: `src/lib/initiatives/__tests__/transform.test.ts`（檔尾新增 describe）

**Interfaces:**
- Consumes: `WindsorAdRecord`（既有型別，`@/lib/windsor/types`）
- Produces: `countDistinctDates(records: WindsorAdRecord[]): number`。Task 8 的頁面用它算天數後傳給 `aggregateInitiatives` / `aggregateAccounts`。

- [ ] **Step 1: 寫失敗測試**（加在 `transform.test.ts` 檔尾；`makeRecord` 工廠已存在於該檔）

```typescript
describe("countDistinctDates", () => {
  it("回傳不重複日期數", () => {
    expect(
      countDistinctDates([
        makeRecord({ date: "2024-01-01" }),
        makeRecord({ date: "2024-01-01", campaign: "另一活動_x" }),
        makeRecord({ date: "2024-01-02" }),
      ]),
    ).toBe(2);
  });

  it("空資料為 0", () => {
    expect(countDistinctDates([])).toBe(0);
  });
});
```

並把檔頭 import 改為：

```typescript
import {
  initiativeKey,
  aggregateInitiatives,
  countDistinctDates,
} from "../transform";
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: FAIL — `countDistinctDates` 不存在（SyntaxError: export not found 或同義錯誤）

- [ ] **Step 3: 最小實作**（加在 `transform.ts` 檔尾）

```typescript
/** 期間天數：取資料中的不重複日期數（含今天時當天未跑完，進度會略偏低）*/
export function countDistinctDates(records: WindsorAdRecord[]): number {
  return new Set(records.map((r) => r.date)).size;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: PASS（既有 14 tests + 新增 2 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/transform.ts src/lib/initiatives/__tests__/transform.test.ts
git commit -m "feat(initiatives): 期間天數推導（不重複日期數）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: campaign 狀態追蹤（取最新日期狀態）

**Files:**
- Modify: `src/lib/initiatives/transform.ts`（`CampaignAcc`、`aggregateInitiatives` 累加迴圈、輸出組裝）
- Modify: `src/lib/initiatives/types.ts`（`InitiativeCampaign` 加 `status`）
- Test: `src/lib/initiatives/__tests__/transform.test.ts`

**Interfaces:**
- Consumes: `WindsorAdRecord.campaignStatus`（已於 normalizeRecord 轉大寫）、`WindsorAdRecord.date`（`YYYY-MM-DD`，可用字串比較）
- Produces: `InitiativeCampaign.status: string`（`"ACTIVE"` / `"PAUSED"` / 其他 / 空字串未知）。Task 4 用它算 ACTIVE-only 期間預算。

- [ ] **Step 1: 寫失敗測試**（加在 `aggregateInitiatives` 的 describe 內）

```typescript
  it("campaign 狀態取最新日期那筆", () => {
    const rows = aggregateInitiatives([
      makeRecord({ date: "2024-01-01", campaignStatus: "ACTIVE" }),
      makeRecord({ date: "2024-01-02", campaignStatus: "PAUSED" }),
    ]);
    expect(rows[0].campaigns[0].status).toBe("PAUSED");
  });

  it("資料順序顛倒仍取最新日期狀態", () => {
    const rows = aggregateInitiatives([
      makeRecord({ date: "2024-01-02", campaignStatus: "PAUSED" }),
      makeRecord({ date: "2024-01-01", campaignStatus: "ACTIVE" }),
    ]);
    expect(rows[0].campaigns[0].status).toBe("PAUSED");
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: FAIL — `expected undefined to be 'PAUSED'`（`status` 欄位不存在）

- [ ] **Step 3: 最小實作**

`types.ts` 的 `InitiativeCampaign` 加欄位：

```typescript
export interface InitiativeCampaign {
  campaign: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
  lifetimeBudget: number;
  dailyBudget: number;
  /** 投放狀態（取期間內最新日期那筆；ACTIVE / PAUSED / 其他 / 空字串未知）*/
  status: string;
}
```

`transform.ts` 的 `CampaignAcc` 加兩個欄位：

```typescript
interface CampaignAcc {
  campaign: string;
  spend: number;
  revenue: number;
  conversions: number;
  /** 預算為快照：取跨日的最大值（同值重複，用 max 穩健處理 0 補值）*/
  lifetimeBudget: number;
  dailyBudget: number;
  /** 投放狀態：取最新日期那筆（statusDate 記錄該筆日期）*/
  status: string;
  statusDate: string;
}
```

初始化 `camp` 時補 `status: "", statusDate: ""`；累加迴圈在預算快照後面加：

```typescript
    // 狀態取最新日期那筆（日期為 YYYY-MM-DD，字串比較即可）
    if (r.date >= camp.statusDate) {
      camp.status = r.campaignStatus;
      camp.statusDate = r.date;
    }
```

輸出組裝的 `campaigns.push({...})` 加 `status: c.status,`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: PASS（18 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/transform.ts src/lib/initiatives/types.ts src/lib/initiatives/__tests__/transform.test.ts
git commit -m "feat(initiatives): campaign 狀態追蹤（取最新日期狀態）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 活動列期間預算 `periodBudget` / `pacingProgress`

**Files:**
- Modify: `src/lib/initiatives/transform.ts`（`aggregateInitiatives` 加第二參數 `days`）
- Modify: `src/lib/initiatives/types.ts`（`InitiativeRow` 加兩欄位）
- Test: `src/lib/initiatives/__tests__/transform.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `CampaignAcc.status`
- Produces: `aggregateInitiatives(records: WindsorAdRecord[], days = 0): InitiativeRow[]`（第二參數選填，預設 0 → 既有呼叫不變）；`InitiativeRow.periodBudget: number`、`InitiativeRow.pacingProgress: number`。Task 6 的 BudgetCell 與排序用這兩個欄位。

- [ ] **Step 1: 寫失敗測試**

```typescript
  it("日預算活動的期間預算 = Σ(ACTIVE 日預算) × 天數，並算出配速達成率", () => {
    const rows = aggregateInitiatives(
      [
        makeRecord({
          campaign: "夏季購物_轉換",
          spend: 2800,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "夏季購物_觸及",
          spend: 200,
          campaignDailyBudget: 300,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    // 只計 ACTIVE 的 500 × 7 = 3500；花費含暫停活動 = 3000
    expect(rows[0].periodBudget).toBe(3500);
    expect(rows[0].pacingProgress).toBeCloseTo(3000 / 3500);
  });

  it("有 lifetime 預算的活動列走消耗語意：pacingProgress 為 0", () => {
    const rows = aggregateInitiatives(
      [
        makeRecord({
          campaign: "夏季購物_轉換",
          campaignLifetimeBudget: 10000,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    expect(rows[0].hasBudget).toBe(true);
    expect(rows[0].pacingProgress).toBe(0);
  });

  it("未帶天數（預設 0）時 periodBudget 為 0、pacingProgress 為 0", () => {
    const rows = aggregateInitiatives([
      makeRecord({
        campaign: "夏季購物_轉換",
        campaignDailyBudget: 500,
        campaignStatus: "ACTIVE",
      }),
    ]);
    expect(rows[0].periodBudget).toBe(0);
    expect(rows[0].pacingProgress).toBe(0);
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: FAIL — `expected undefined to be 3500`

- [ ] **Step 3: 最小實作**

`types.ts` 的 `InitiativeRow` 在 `progress` 後面加：

```typescript
  /** 配速推算期間預算：Σ(ACTIVE 活動日預算) × 天數；lifetime 活動走消耗語意不計入 */
  periodBudget: number;
  /** 配速達成率 = 花費 ÷ periodBudget；有 lifetime 預算或無期間預算時為 0 */
  pacingProgress: number;
```

`transform.ts` 的 `aggregateInitiatives` 簽名改為：

```typescript
export function aggregateInitiatives(
  records: WindsorAdRecord[],
  days = 0,
): InitiativeRow[] {
```

輸出組裝迴圈在 `const hasBudget = lifetimeBudget > 0;` 之後加：

```typescript
    // 配速推算：只計 ACTIVE 且無 lifetime 的活動日預算（lifetime 活動走消耗語意）
    let activeDailyBudget = 0;
    for (const c of init.campaigns.values()) {
      if (c.lifetimeBudget === 0 && c.status === "ACTIVE") {
        activeDailyBudget += c.dailyBudget;
      }
    }
    const periodBudget = hasBudget ? 0 : activeDailyBudget * days;
```

`rows.push({...})` 加：

```typescript
      periodBudget,
      pacingProgress: periodBudget > 0 ? init.spend / periodBudget : 0,
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: PASS（21 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/transform.ts src/lib/initiatives/types.ts src/lib/initiatives/__tests__/transform.test.ts
git commit -m "feat(initiatives): 活動列期間預算與配速達成率

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 帳號聚合 `aggregateAccounts`

**Files:**
- Modify: `src/lib/initiatives/transform.ts`（檔尾新增）
- Modify: `src/lib/initiatives/types.ts`（新增 `AccountSummary`）
- Test: `src/lib/initiatives/__tests__/transform.test.ts`

**Interfaces:**
- Consumes: `WindsorAdRecord`、`platformLabel`（transform.ts 內部既有函式）
- Produces: `AccountSummary { accountName, platform, spend, periodBudget, hasBudget, progress }`、`aggregateAccounts(records: WindsorAdRecord[], days: number): AccountSummary[]`（依花費由高到低排序）。Task 6、7、8 的 UI 全靠這個。

- [ ] **Step 1: 寫失敗測試**（`transform.test.ts` 檔尾新增 describe；import 加 `aggregateAccounts`）

```typescript
describe("aggregateAccounts", () => {
  it("期間預算只計 ACTIVE 活動：Σ日預算 × 天數；暫停活動花費仍計入", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          spend: 100,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "B_x",
          spend: 50,
          campaignDailyBudget: 300,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    expect(s).toHaveLength(1);
    expect(s[0].periodBudget).toBe(3500);
    expect(s[0].spend).toBe(150);
    expect(s[0].progress).toBeCloseTo(150 / 3500);
    expect(s[0].hasBudget).toBe(true);
  });

  it("lifetime 活動以 lifetime 金額計入且不乘天數", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          campaignLifetimeBudget: 10000,
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "B_x",
          campaignDailyBudget: 200,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    // lifetime 10000 + ACTIVE 日預算 200×7 = 11400
    expect(s[0].periodBudget).toBe(11400);
  });

  it("日預算為快照：同活動跨日取最大值不加總", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          date: "2024-01-01",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "A_x",
          date: "2024-01-02",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
      ],
      7,
    );
    expect(s[0].periodBudget).toBe(3500);
  });

  it("狀態取最新日期：後來暫停的活動不計入分母", () => {
    const s = aggregateAccounts(
      [
        makeRecord({
          campaign: "A_x",
          date: "2024-01-01",
          campaignDailyBudget: 500,
          campaignStatus: "ACTIVE",
        }),
        makeRecord({
          campaign: "A_x",
          date: "2024-01-02",
          campaignDailyBudget: 500,
          campaignStatus: "PAUSED",
        }),
      ],
      7,
    );
    expect(s[0].periodBudget).toBe(0);
    expect(s[0].hasBudget).toBe(false);
    expect(s[0].progress).toBe(0);
  });

  it("不同帳號分開彙總，依花費由高到低排序", () => {
    const s = aggregateAccounts(
      [
        makeRecord({ account_name: "魔幻主義", spend: 100 }),
        makeRecord({ account_name: "Plaisir", spend: 900 }),
      ],
      7,
    );
    expect(s.map((a) => a.accountName)).toEqual(["Plaisir", "魔幻主義"]);
  });

  it("空資料回傳空陣列", () => {
    expect(aggregateAccounts([], 7)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: FAIL — `aggregateAccounts` 不存在

- [ ] **Step 3: 最小實作**

`types.ts` 檔尾加：

```typescript
/** 帳號層級的預算配速摘要 */
export interface AccountSummary {
  accountName: string;
  /** 平台顯示名（Meta / Google / 其他）*/
  platform: string;
  /** 全部活動花費（含已暫停）*/
  spend: number;
  /** 期間預算：Σ(ACTIVE 活動日預算) × 天數；lifetime 活動改以 lifetime 金額計入（不乘天數）*/
  periodBudget: number;
  /** periodBudget > 0 */
  hasBudget: boolean;
  /** 花費 ÷ 期間預算；無期間預算為 0 */
  progress: number;
}
```

`transform.ts` 檔尾加（import 補 `AccountSummary`）：

```typescript
/** 帳號內單一 campaign 的預算/狀態累加狀態 */
interface AccountCampaignAcc {
  lifetimeBudget: number;
  dailyBudget: number;
  status: string;
  statusDate: string;
}

/** 帳號內部的可變累加狀態 */
interface AccountAcc {
  accountName: string;
  platform: string;
  spend: number;
  /** key: campaign 名稱 */
  campaigns: Map<string, AccountCampaignAcc>;
}

/** 將原始廣告記錄彙總為帳號層級的預算配速摘要（依花費由高到低）*/
export function aggregateAccounts(
  records: WindsorAdRecord[],
  days: number,
): AccountSummary[] {
  const map = new Map<string, AccountAcc>();

  for (const r of records) {
    const accountName = r.account_name?.trim() || "未命名帳戶";
    let acc = map.get(accountName);
    if (!acc) {
      acc = {
        accountName,
        platform: platformLabel(r.source),
        spend: 0,
        campaigns: new Map(),
      };
      map.set(accountName, acc);
    }
    // 花費計入全部活動（含已暫停）
    acc.spend += r.spend;

    const campName = r.campaign?.trim() || "未命名";
    let camp = acc.campaigns.get(campName);
    if (!camp) {
      camp = { lifetimeBudget: 0, dailyBudget: 0, status: "", statusDate: "" };
      acc.campaigns.set(campName, camp);
    }
    // 預算快照：跨日取最大值（勿加總）
    camp.lifetimeBudget = Math.max(
      camp.lifetimeBudget,
      r.campaignLifetimeBudget,
    );
    camp.dailyBudget = Math.max(camp.dailyBudget, r.campaignDailyBudget);
    // 狀態取最新日期那筆
    if (r.date >= camp.statusDate) {
      camp.status = r.campaignStatus;
      camp.statusDate = r.date;
    }
  }

  const summaries: AccountSummary[] = [];
  for (const acc of map.values()) {
    let periodBudget = 0;
    for (const c of acc.campaigns.values()) {
      if (c.lifetimeBudget > 0) {
        // lifetime 為總額上限，比推算值可信，直接計入（不乘天數）
        periodBudget += c.lifetimeBudget;
      } else if (c.status === "ACTIVE") {
        periodBudget += c.dailyBudget * days;
      }
    }
    const hasBudget = periodBudget > 0;
    summaries.push({
      accountName: acc.accountName,
      platform: acc.platform,
      spend: acc.spend,
      periodBudget,
      hasBudget,
      progress: hasBudget ? acc.spend / periodBudget : 0,
    });
  }

  // 依花費由高到低（帳號卡片顯示順序）
  return summaries.sort((a, b) => b.spend - a.spend);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: PASS（27 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/transform.ts src/lib/initiatives/types.ts src/lib/initiatives/__tests__/transform.test.ts
git commit -m "feat(initiatives): 帳號層級預算配速聚合 aggregateAccounts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 表格升級（BudgetCell 配速、分組列達成率、progress 排序、token 清理）

UI task，無單元測試基礎建設，以 `npx tsc --noEmit` + `npm run lint` + 瀏覽器手動驗證把關。

**Files:**
- Modify: `src/components/initiatives/initiative-table.tsx`

**Interfaces:**
- Consumes: Task 1 `pacingLevel` / `PACING_TEXT` / `PACING_BG`；Task 4 `InitiativeRow.periodBudget` / `pacingProgress`；Task 5 `AccountSummary`
- Produces: `InitiativeTable` props 變為 `{ rows: InitiativeRow[]; accounts: AccountSummary[] }`。Task 8 的頁面照此傳入。

- [ ] **Step 1: 修改 imports 與 props**

```typescript
import { useState, useMemo, Fragment } from "react";
import type { InitiativeRow, AccountSummary } from "@/lib/initiatives/types";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency, formatRoas, formatNumber } from "@/lib/utils/format";

interface InitiativeTableProps {
  rows: InitiativeRow[];
  accounts: AccountSummary[];
}
```

`SortField` 拿掉不再用的 `"budget"`：

```typescript
type SortField = "spend" | "roas" | "cpa" | "progress";
```

- [ ] **Step 2: BudgetCell 加入日預算配速呈現**

整個 `BudgetCell` 換成：

```tsx
/** 花費 / 預算呈現：lifetime 用單向消耗、日預算用雙向配速、皆無顯示 — */
function BudgetCell({ row }: { row: InitiativeRow }) {
  // lifetime 預算：消耗語意（總額用完為止，滿了才紅）
  if (row.hasBudget) {
    const pct = row.progress * 100;
    const clamped = Math.min(pct, 100);
    return (
      <div className="min-w-[140px]">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-mono tabular-nums text-foreground">
            {formatCurrency(row.spend)} / {formatCurrency(row.budget)}
          </span>
          <span className="font-mono tabular-nums text-muted ml-2">
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressBarColor(row.progress)}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    );
  }
  // 日預算：配速語意（花太慢或太快都要示警，雙向三色）
  if (row.periodBudget > 0) {
    const pct = row.pacingProgress * 100;
    const clamped = Math.min(pct, 100);
    const level = pacingLevel(row.pacingProgress);
    return (
      <div className="min-w-[140px]">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-mono tabular-nums text-foreground">
            {formatCurrency(row.spend)} / {formatCurrency(row.periodBudget)}
          </span>
          <span
            className={`font-mono tabular-nums font-semibold ml-2 ${PACING_TEXT[level]}`}
          >
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${PACING_BG[level]}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="text-[11px] text-muted mt-0.5 font-mono tabular-nums">
          日預算 {formatCurrency(row.dailyBudget)}/天
        </div>
      </div>
    );
  }
  // 有日預算但無 ACTIVE 活動（全暫停）：維持 chip
  if (row.dailyBudget > 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-info/10 text-info text-xs px-2 py-0.5 font-mono tabular-nums">
        日預算 {formatCurrency(row.dailyBudget)}/天
      </span>
    );
  }
  return <span className="text-muted text-sm">—</span>;
}
```

（`progressBarColor` 與 `roasColor` 保留不動。）

- [ ] **Step 3: 排序接上 progress（依達成率）**

`InitiativeTable` 內加取值 helper，並讓「花費 / 預算」欄位改用 `progress` 排序：

```typescript
  /** 排序取值：progress 用有效達成率（lifetime 消耗或日預算配速）*/
  function sortValue(r: InitiativeRow, field: SortField): number {
    if (field === "progress") {
      return r.hasBudget ? r.progress : r.pacingProgress;
    }
    return r[field];
  }
```

`sortRows` 改用它：

```typescript
    const sortRows = (list: InitiativeRow[]) =>
      [...list].sort((a, b) => {
        const av = sortValue(a, sortField);
        const bv = sortValue(b, sortField);
        return sortDir === "asc" ? av - bv : bv - av;
      });
```

`columns` 改為：

```typescript
  const columns: { key: SortField; label: string }[] = [
    { key: "spend", label: "花費" },
    { key: "progress", label: "花費 / 預算" },
    { key: "roas", label: "ROAS" },
    { key: "cpa", label: "CPA" },
  ];
```

- [ ] **Step 4: 帳號分組列加達成率**

`InitiativeTable` 開頭建立查表（放在 `groups` useMemo 之前）：

```typescript
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.accountName, a])),
    [accounts],
  );
```

分組列的 `<td>` 內容換成（`group.spend` 保留給無預算帳號用）：

```tsx
                  <td colSpan={2 + columns.length} className="px-4 py-2">
                    {(() => {
                      const acc = accountMap.get(group.accountName);
                      const level = acc?.hasBudget
                        ? pacingLevel(acc.progress)
                        : null;
                      return (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                            {group.accountName}
                          </span>
                          {acc?.hasBudget && level ? (
                            <>
                              <span className="text-xs text-muted font-mono tabular-nums">
                                {formatCurrency(acc.spend)} /{" "}
                                {formatCurrency(acc.periodBudget)}
                              </span>
                              <span
                                className={`text-xs font-semibold font-mono tabular-nums ${PACING_TEXT[level]}`}
                              >
                                {(acc.progress * 100).toFixed(0)}%
                              </span>
                              <span
                                className={`w-2 h-2 rounded-full ${PACING_BG[level]}`}
                              />
                            </>
                          ) : (
                            <span className="text-xs text-muted font-mono tabular-nums">
                              {formatCurrency(group.spend)}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
```

- [ ] **Step 5: token 清理（僅此檔）**

- thead：`bg-gray-50` → `bg-background/60`
- 分組列：`bg-gray-50/60` → `bg-background/60`
- 活動列 hover：`hover:bg-gray-50` → `hover:bg-background/60`
- 展開明細列：`bg-gray-50/40` → `bg-background/40`
- （進度條軌道 `bg-gray-100` 已在 Step 2 改為 `bg-background`）

- [ ] **Step 6: 型別與 lint 檢查**

Run: `npx tsc --noEmit`
Expected: 只剩 `initiatives/page.tsx` 傳參不符的錯誤（缺 `accounts` prop）— 這是預期的，Task 8 會接上。若要保持每步全綠，可先在此步同時把 Task 8 Step 1 的頁面改動一起做；否則記下錯誤，Task 8 完成後再驗。

- [ ] **Step 7: Commit**

```bash
git add src/components/initiatives/initiative-table.tsx
git commit -m "feat(initiatives): 表格配速呈現（BudgetCell 雙向三色、分組列達成率、progress 排序、token 清理）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: KPI 卡「總預算」→「期間預算」＋整體達成率

**Files:**
- Modify: `src/components/dashboard/kpi-card.tsx`（加 `subtitle` prop）
- Modify: `src/components/initiatives/initiative-kpi-cards.tsx`

**Interfaces:**
- Consumes: Task 1 `pacingLevel` / `PACING_TEXT`；Task 5 `AccountSummary`
- Produces: `KpiCard` 新增選填 `subtitle?: ReactNode`（顯示在 value 下方）；`InitiativeKpiCards` props 變為 `{ rows: InitiativeRow[]; accounts: AccountSummary[] }`。

- [ ] **Step 1: KpiCard 加 subtitle**

`KpiCardProps` 加 `subtitle?: ReactNode;`，函式參數解構加 `subtitle`，在 value 的 `<p>` 之後、`change` 區塊之前加：

```tsx
          {subtitle !== undefined && <div className="mt-2">{subtitle}</div>}
```

- [ ] **Step 2: InitiativeKpiCards 改用期間預算**

imports 與 props：

```typescript
import type { InitiativeRow, AccountSummary } from "@/lib/initiatives/types";
import { pacingLevel, PACING_TEXT } from "@/lib/initiatives/pacing";

interface InitiativeKpiCardsProps {
  rows: InitiativeRow[];
  accounts: AccountSummary[];
}
```

`totals` useMemo 拿掉 `budget` 累加，另外加一個帳號配速 useMemo：

```typescript
  // 期間預算與整體達成率（帳號層級彙總）
  const pacing = useMemo(() => {
    let periodBudget = 0;
    let spend = 0;
    for (const a of accounts) {
      periodBudget += a.periodBudget;
      spend += a.spend;
    }
    return {
      periodBudget,
      progress: periodBudget > 0 ? spend / periodBudget : 0,
    };
  }, [accounts]);
```

「總預算」卡換成：

```tsx
      <KpiCard
        title="期間預算"
        value={
          pacing.periodBudget > 0 ? formatCurrency(pacing.periodBudget) : "—"
        }
        iconBg="bg-info/10 text-info"
        subtitle={
          pacing.periodBudget > 0 ? (
            <span
              className={`text-xs font-semibold font-mono tabular-nums ${PACING_TEXT[pacingLevel(pacing.progress)]}`}
            >
              達成率 {(pacing.progress * 100).toFixed(0)}%
            </span>
          ) : undefined
        }
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        }
      />
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 只剩 `initiatives/page.tsx` 的 props 錯誤（Task 8 解）

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/kpi-card.tsx src/components/initiatives/initiative-kpi-cards.tsx
git commit -m "feat(initiatives): KPI 卡改期間預算＋整體達成率

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 帳號卡片區元件＋頁面接線＋全套驗證

**Files:**
- Create: `src/components/initiatives/account-pacing-cards.tsx`
- Modify: `src/app/initiatives/page.tsx`

**Interfaces:**
- Consumes: Task 1 pacing helpers；Task 2 `countDistinctDates`；Task 4 `aggregateInitiatives(records, days)`；Task 5 `aggregateAccounts`；Task 6/7 的新 props
- Produces: 完整運作的 /initiatives 頁

- [ ] **Step 1: 建立 AccountPacingCards 元件**

```tsx
// src/components/initiatives/account-pacing-cards.tsx
"use client";

import type { AccountSummary } from "@/lib/initiatives/types";
import {
  pacingLevel,
  PACING_TEXT,
  PACING_BG,
} from "@/lib/initiatives/pacing";
import { formatCurrency } from "@/lib/utils/format";

interface AccountPacingCardsProps {
  accounts: AccountSummary[];
  selectedAccounts: string[];
  onAccountsChange: (accounts: string[]) => void;
}

/** 帳號預算配速卡片區：每帳號一張卡，點擊切換「只看該帳號」篩選 */
export default function AccountPacingCards({
  accounts,
  selectedAccounts,
  onAccountsChange,
}: AccountPacingCardsProps) {
  if (accounts.length === 0) return null;

  // 全部帳號都無進行中預算 → 整區收合成一行提示
  if (!accounts.some((a) => a.hasBudget)) {
    return (
      <p className="text-sm text-muted">
        所有帳號目前皆無進行中的活動預算，無法推算期間預算進度。
      </p>
    );
  }

  const isOnly = (name: string) =>
    selectedAccounts.length === 1 && selectedAccounts[0] === name;

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">
        帳號預算進度
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {accounts.map((a) => {
          const level = pacingLevel(a.progress);
          const pct = a.progress * 100;
          const selected = isOnly(a.accountName);
          return (
            <button
              key={a.accountName}
              type="button"
              onClick={() => onAccountsChange(selected ? [] : [a.accountName])}
              className={`text-left bg-card border rounded-xl p-4 transition-all card-hover ${
                selected
                  ? "border-accent ring-1 ring-accent"
                  : "border-card-border"
              }`}
            >
              <div className="text-xs text-muted truncate mb-1">
                {a.accountName}
              </div>
              {a.hasBudget ? (
                <>
                  <div
                    className={`text-2xl font-semibold font-mono tabular-nums ${PACING_TEXT[level]}`}
                  >
                    {pct.toFixed(0)}%
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-background overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full ${PACING_BG[level]}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted font-mono tabular-nums mt-1.5">
                    {formatCurrency(a.spend)} / {formatCurrency(a.periodBudget)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-muted">
                    —
                  </div>
                  <div className="text-[11px] text-muted mt-1.5">
                    無進行中預算 · 花費 {formatCurrency(a.spend)}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

（loading / error / empty 由頁面既有機制涵蓋：載入中整頁 spinner、錯誤整頁錯誤區、無資料整頁 EmptyState；本元件另處理「全帳號無預算」的區塊空狀態。）

- [ ] **Step 2: 頁面接線**（`src/app/initiatives/page.tsx` 的 `InitiativesContent`）

imports：

```typescript
import {
  aggregateInitiatives,
  aggregateAccounts,
  countDistinctDates,
} from "@/lib/initiatives/transform";
import AccountPacingCards from "@/components/initiatives/account-pacing-cards";
```

`allRows` useMemo 之前/之處改為：

```typescript
  // 期間天數（不重複日期數），供期間預算推算
  const days = useMemo(() => countDistinctDates(data), [data]);

  // 全部行銷活動列（未套帳號篩選），供帳號清單與篩選使用
  const allRows = useMemo(
    () => aggregateInitiatives(data, days),
    [data, days],
  );

  // 帳號層級配速摘要（卡片區用全部；KPI 尊重帳號篩選）
  const accountSummaries = useMemo(
    () => aggregateAccounts(data, days),
    [data, days],
  );
  const filteredSummaries = useMemo(() => {
    if (selectedAccounts.length === 0) return accountSummaries;
    const set = new Set(selectedAccounts);
    return accountSummaries.filter((a) => set.has(a.accountName));
  }, [accountSummaries, selectedAccounts]);
```

成功狀態的 render 改為：

```tsx
      <div className="flex-1 p-4 sm:p-6 space-y-6 animate-fade-in">
        <InitiativeKpiCards rows={rows} accounts={filteredSummaries} />
        <AccountPacingCards
          accounts={accountSummaries}
          selectedAccounts={selectedAccounts}
          onAccountsChange={onAccountsChange}
        />
        <InitiativeTable rows={rows} accounts={accountSummaries} />
      </div>
```

- [ ] **Step 3: 全套驗證**

Run: `npm test`
Expected: PASS（全部測試，含新增的 pacing 6 + transform 13）

Run: `npx tsc --noEmit`
Expected: 無錯誤

Run: `npm run lint`
Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add src/components/initiatives/account-pacing-cards.tsx src/app/initiatives/page.tsx
git commit -m "feat(initiatives): 帳號預算配速卡片區＋頁面接線

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 瀏覽器手動驗證**（需使用者啟動 dev server）

開 `http://localhost:3000/initiatives` 檢查：

1. KPI 卡「期間預算」有金額與帶色達成率（不再是「—」）
2. 帳號卡片區依花費排序，各卡有大字 %＋色帶進度條＋`花費 / 期間預算`
3. 點卡片 → 表格只剩該帳號；再點一次 → 恢復全部
4. 表格分組列有 `花費/期間預算 · % ●`
5. 日預算活動列有配速進度條＋雙向三色；lifetime 活動列維持消耗條
6. 點「花費 / 預算」表頭可依達成率排序
7. 切換日期範圍（近 7 天 ↔ 近 30 天）→ 期間預算與 % 跟著變

驗證完成附截圖或觀察記錄後才算收工。

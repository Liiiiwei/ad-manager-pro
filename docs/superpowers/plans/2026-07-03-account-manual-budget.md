# 帳號手動月預算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者為每個廣告帳號手動填寫月預算（存 DB），/initiatives 帳號卡以「月預算 ÷ 當月天數 × 期間天數」換算期間預算並計算配速 %，手動值優先於 API 推算值。

**Architecture:** 純函式計算層（`aggregateAccounts` 加選填第三參數）＋ schema/merge 純函式模組（可單測）＋ 既有 `/api/settings` GET/PATCH 擴充（`UserSettings.accountBudgets Json?`）＋ 前端 hook `useAccountBudgets()` 與帳號卡就地編輯 UI。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind 4（token 制）/ Prisma 7 / Zod 3 / Vitest

**Spec:** `docs/superpowers/specs/2026-07-03-account-manual-budget-design.md`

## Global Constraints

- 全程繁體中文；程式碼註解中文；禁止混入日文、簡體中文（如「維持」不可寫成「维持」）。
- 顏色一律用 token（`bg-accent`、`text-muted`、`text-danger`…），禁止硬寫色票（`bg-blue-500`）。
- UI 必須處理 loading / error / empty / success 四狀態；async 操作期間按鈕 disabled。
- TDD：先寫失敗測試、看它失敗、再寫最小實作。
- Zod 驗證：`z.record(z.string().min(1).max(200), z.number().positive().max(1e9).nullable())`。
- PATCH merge 語意：只更新送來的 key；值 `null` 刪除該 key；未送的 key 不動。
- 換算公式：`periodBudget = (monthlyBudget / daysInMonth) * days`；`daysInMonth <= 0` 時落回 API 邏輯（防除以零）。
- 手動值優先於 API 推算；清除即回退 API 邏輯。
- 金額為帳號原幣別，不做幣別換算。
- key 用 `account_name`（已知限制：平台改帳號名後斷連，spec 已載明）。
- Commit 用 Conventional Commits，結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 明確不做（YAGNI）：多幣別、固定月視角累計、設定頁集中管理區塊、帳號 ID keying、initiative 層手動預算。

---

### Task 1: transform 層手動預算覆寫

**Files:**
- Modify: `src/lib/initiatives/types.ts:55-67`（`AccountSummary` 加兩個選填欄位）
- Modify: `src/lib/initiatives/transform.ts:204-268`（`aggregateAccounts` 加第三參數）
- Test: `src/lib/initiatives/__tests__/transform.test.ts`（檔尾新增 describe 區塊）

**Interfaces:**
- Consumes: 既有 `aggregateAccounts(records: WindsorAdRecord[], days: number): AccountSummary[]`、測試檔既有的 `makeRecord()` helper（預設 `account_name: "魔幻主義"`、`campaignDailyBudget: 0`、`campaignStatus: "ACTIVE"`）。
- Produces: `export interface AccountBudgetOptions { manualBudgets: Record<string, number>; daysInMonth: number }`（從 `transform.ts` export）；`aggregateAccounts(records, days, budgetOptions?: AccountBudgetOptions)`；`AccountSummary` 新欄位 `budgetSource?: "manual" | "api"` 與 `monthlyBudget?: number`。Task 5 的頁面與卡片依賴這些名稱。

- [ ] **Step 1: 寫失敗測試**

在 `src/lib/initiatives/__tests__/transform.test.ts` 檔案最後新增：

```ts
describe("aggregateAccounts 手動月預算", () => {
  const budgetOptions = { manualBudgets: { 魔幻主義: 31000 }, daysInMonth: 31 };

  it("手動值覆寫 API 推算：有 ACTIVE 日預算仍用手動月預算換算", () => {
    const records = [
      makeRecord({ campaignDailyBudget: 500, campaignStatus: "ACTIVE" }),
    ];
    const [acc] = aggregateAccounts(records, 7, budgetOptions);
    // 31000 ÷ 31 天 × 7 天 = 7000（非 API 的 500 × 7 = 3500）
    expect(acc.periodBudget).toBe(7000);
    expect(acc.hasBudget).toBe(true);
    expect(acc.budgetSource).toBe("manual");
    expect(acc.monthlyBudget).toBe(31000);
  });

  it("手動值補位：無任何 API 預算時 hasBudget 為 true", () => {
    const records = [
      makeRecord({ campaignDailyBudget: 0, campaignStatus: "ACTIVE" }),
    ];
    const [acc] = aggregateAccounts(records, 7, budgetOptions);
    expect(acc.hasBudget).toBe(true);
    expect(acc.periodBudget).toBe(7000);
    expect(acc.budgetSource).toBe("manual");
  });

  it("無手動值時結果與未傳 budgetOptions 完全相同，budgetSource 為 api", () => {
    const records = [
      makeRecord({ campaignDailyBudget: 500, campaignStatus: "ACTIVE" }),
    ];
    const withEmpty = aggregateAccounts(records, 7, {
      manualBudgets: {},
      daysInMonth: 31,
    });
    const without = aggregateAccounts(records, 7);
    expect(withEmpty).toEqual(without);
    expect(withEmpty[0].budgetSource).toBe("api");
    expect(withEmpty[0].periodBudget).toBe(3500);
  });

  it("無手動值且無 API 預算時 budgetSource 為 undefined", () => {
    const records = [
      makeRecord({ campaignDailyBudget: 0, campaignStatus: "ACTIVE" }),
    ];
    const [acc] = aggregateAccounts(records, 7);
    expect(acc.hasBudget).toBe(false);
    expect(acc.budgetSource).toBeUndefined();
    expect(acc.monthlyBudget).toBeUndefined();
  });

  it("daysInMonth 為 0 時落回 API 邏輯（防除以零）", () => {
    const records = [
      makeRecord({ campaignDailyBudget: 500, campaignStatus: "ACTIVE" }),
    ];
    const [acc] = aggregateAccounts(records, 7, {
      manualBudgets: { 魔幻主義: 31000 },
      daysInMonth: 0,
    });
    expect(acc.periodBudget).toBe(3500);
    expect(acc.budgetSource).toBe("api");
    expect(acc.monthlyBudget).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: 新增 5 個測試 FAIL（`aggregateAccounts` 收不到第三參數 → periodBudget 仍為 API 值 / budgetSource 為 undefined）；既有測試 PASS。

- [ ] **Step 3: 最小實作**

`src/lib/initiatives/types.ts` — `AccountSummary` interface（`progress` 欄位之後）加：

```ts
  /** 預算來源：manual = 手動月預算換算；api = 平台預算推算；無預算時 undefined */
  budgetSource?: "manual" | "api";
  /** 手動月預算原始值（budgetSource === "manual" 時存在，原幣別） */
  monthlyBudget?: number;
```

`src/lib/initiatives/transform.ts` — 在 `aggregateAccounts` 前加 interface、改簽名與彙總段：

```ts
/** 帳號手動月預算選項 */
export interface AccountBudgetOptions {
  /** 帳號名稱 → 手動月預算（原幣別） */
  manualBudgets: Record<string, number>;
  /** 當月天數（呼叫端以使用者當下月份計算） */
  daysInMonth: number;
}

/** 將原始廣告記錄彙總為帳號層級的預算配速摘要（依花費由高到低）*/
export function aggregateAccounts(
  records: WindsorAdRecord[],
  days: number,
  budgetOptions?: AccountBudgetOptions,
): AccountSummary[] {
```

彙總迴圈（原 245-263 行）改為：

```ts
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

    // 手動月預算優先：換算成期間預算，覆寫 API 推算值
    const manual = budgetOptions?.manualBudgets[acc.accountName] ?? 0;
    const daysInMonth = budgetOptions?.daysInMonth ?? 0;
    let budgetSource: "manual" | "api" | undefined;
    let monthlyBudget: number | undefined;
    if (manual > 0 && daysInMonth > 0) {
      periodBudget = (manual / daysInMonth) * days;
      budgetSource = "manual";
      monthlyBudget = manual;
    }

    const hasBudget = periodBudget > 0;
    if (budgetSource === undefined && hasBudget) {
      budgetSource = "api";
    }
    summaries.push({
      accountName: acc.accountName,
      platform: acc.platform,
      spend: acc.spend,
      periodBudget,
      hasBudget,
      progress: hasBudget ? acc.spend / periodBudget : 0,
      budgetSource,
      monthlyBudget,
    });
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/initiatives/__tests__/transform.test.ts`
Expected: 全部 PASS（含既有測試）。

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全套件 PASS、型別檢查乾淨。

- [ ] **Step 5: Commit**

```bash
git add src/lib/initiatives/types.ts src/lib/initiatives/transform.ts src/lib/initiatives/__tests__/transform.test.ts
git commit -m "feat(initiatives): aggregateAccounts 支援手動月預算覆寫

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: accountBudgets schema 與 merge 純函式模組

**Files:**
- Create: `src/lib/settings/account-budgets.ts`
- Test: `src/lib/settings/__tests__/account-budgets.test.ts`

**Interfaces:**
- Consumes: `zod`（v3，已在 dependencies）。
- Produces: `export const accountBudgetsSchema`（Zod schema，值可為 `number | null`）；`export type AccountBudgetsPatch = z.infer<typeof accountBudgetsSchema>`；`export function mergeAccountBudgets(existing: unknown, patch: AccountBudgetsPatch): Record<string, number>`。Task 3 的 route 依賴這三個名稱。

- [ ] **Step 1: 寫失敗測試**

建立 `src/lib/settings/__tests__/account-budgets.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
  accountBudgetsSchema,
  mergeAccountBudgets,
} from "../account-budgets";

describe("accountBudgetsSchema", () => {
  it("接受正數與 null 值", () => {
    const result = accountBudgetsSchema.safeParse({
      魔幻主義: 31000,
      Class: null,
    });
    expect(result.success).toBe(true);
  });

  it("拒絕負數與零", () => {
    expect(accountBudgetsSchema.safeParse({ A: -1 }).success).toBe(false);
    expect(accountBudgetsSchema.safeParse({ A: 0 }).success).toBe(false);
  });

  it("拒絕超過 1e9 的值", () => {
    expect(accountBudgetsSchema.safeParse({ A: 1e9 + 1 }).success).toBe(false);
  });

  it("拒絕超過 200 字的 key", () => {
    expect(
      accountBudgetsSchema.safeParse({ ["x".repeat(201)]: 100 }).success,
    ).toBe(false);
  });

  it("拒絕非數字值", () => {
    expect(accountBudgetsSchema.safeParse({ A: "100" }).success).toBe(false);
  });
});

describe("mergeAccountBudgets", () => {
  it("null 值刪除該 key，未送的 key 不動", () => {
    expect(mergeAccountBudgets({ A: 100, B: 200 }, { A: null })).toEqual({
      B: 200,
    });
  });

  it("數字覆寫既有值並可新增 key", () => {
    expect(mergeAccountBudgets({ A: 100 }, { A: 300, C: 50 })).toEqual({
      A: 300,
      C: 50,
    });
  });

  it("existing 非物件（null / 陣列 / 字串）時視為空", () => {
    expect(mergeAccountBudgets(null, { A: 100 })).toEqual({ A: 100 });
    expect(mergeAccountBudgets([1], { A: 100 })).toEqual({ A: 100 });
    expect(mergeAccountBudgets("x", { A: 100 })).toEqual({ A: 100 });
  });

  it("existing 中非正數或非數字值被清掉（防 DB 殘留髒資料）", () => {
    expect(mergeAccountBudgets({ A: -5, B: "x", C: 100 }, {})).toEqual({
      C: 100,
    });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/settings/__tests__/account-budgets.test.ts`
Expected: FAIL — `Cannot find module '../account-budgets'`（模組不存在）。

- [ ] **Step 3: 最小實作**

建立 `src/lib/settings/account-budgets.ts`：

```ts
import { z } from "zod";

/**
 * 帳號手動月預算的 PATCH 驗證 schema。
 * key = 帳號名稱（account_name）；value = 月預算（原幣別）；
 * value 為 null 表示刪除該帳號的手動預算。
 */
export const accountBudgetsSchema = z.record(
  z.string().min(1).max(200),
  z.number().positive().max(1e9).nullable(),
);

export type AccountBudgetsPatch = z.infer<typeof accountBudgetsSchema>;

/**
 * merge 語意：只動 patch 有的 key；null 刪除、數字覆寫；
 * existing 非物件或值非正數時視為不存在（防 DB 殘留髒資料）。
 */
export function mergeAccountBudgets(
  existing: unknown,
  patch: AccountBudgetsPatch,
): Record<string, number> {
  const base: Record<string, number> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [k, v] of Object.entries(existing)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        base[k] = v;
      }
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return base;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/settings/__tests__/account-budgets.test.ts`
Expected: 9/9 PASS。

Run: `npx tsc --noEmit`
Expected: 乾淨。

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/account-budgets.ts src/lib/settings/__tests__/account-budgets.test.ts
git commit -m "feat(settings): accountBudgets Zod schema 與 merge 純函式

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Prisma 欄位 + /api/settings GET/PATCH 擴充

**Files:**
- Modify: `prisma/schema.prisma:38`（`thresholds Json?` 下一行加欄位）
- Modify: `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: Task 2 的 `accountBudgetsSchema`、`mergeAccountBudgets`（`@/lib/settings/account-budgets`）；既有 `getCurrentUser()`、`getUserSettings()`、`updateUserSettings()`。
- Produces: GET `/api/settings` 回應多一個頂層欄位 `accountBudgets: Record<string, number>`（未設定時 `{}`）；PATCH 接受頂層 `accountBudgets`（merge 語意）。Task 4 的 hook 依賴這個 API 形狀。

本 task 是薄膠水層，核心邏輯已在 Task 2 用 TDD 覆蓋；此處以型別檢查＋全套件回歸驗證。

- [ ] **Step 1: 加 Prisma 欄位**

`prisma/schema.prisma` 的 `UserSettings` model，在 `thresholds Json?` 之後加一行：

```prisma
  accountBudgets     Json?
```

- [ ] **Step 2: 重新生成 Prisma Client**

Run: `npx prisma generate`
Expected: 成功，`UserSettings` 型別含 `accountBudgets`。

（`npx prisma db push` 需本地 DB 執行中——`npm run dev` 會啟動 `prisma dev`。若 DB 未啟動而 push 失敗屬預期，dev/build 時會再 push，不影響測試與型別檢查，跳過即可。）

- [ ] **Step 3: 擴充 route**

`src/app/api/settings/route.ts` 修改四處：

(1) import 區加：

```ts
import {
  accountBudgetsSchema,
  mergeAccountBudgets,
} from "@/lib/settings/account-budgets";
```

(2) `SettingsUpdateData` interface 加欄位：

```ts
  accountBudgets?: Prisma.InputJsonValue;
```

(3) `settingsSchema` 的 `thresholds: thresholdsSchema.optional(),` 之後加：

```ts
    accountBudgets: accountBudgetsSchema.optional(),
```

(4a) GET：無 settings 的預設回應物件加 `accountBudgets: {},`；有 settings 的回應物件加：

```ts
      accountBudgets: settings.accountBudgets ?? {},
```

(4b) PATCH：在 `if (data.thresholds) {...}` 區塊之後、`await updateUserSettings(...)` 之前加：

```ts
    // 帳號手動月預算：merge 語意（只動送來的 key；null 刪除該 key）
    if (data.accountBudgets) {
      const existing = await getUserSettings(user.id);
      updateData.accountBudgets = mergeAccountBudgets(
        existing?.accountBudgets,
        data.accountBudgets,
      ) as Prisma.InputJsonValue;
    }
```

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 型別乾淨、全套件 PASS。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/app/api/settings/route.ts
git commit -m "feat(settings): UserSettings.accountBudgets 欄位與 API GET/PATCH 擴充

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: useAccountBudgets hook

**Files:**
- Create: `src/hooks/use-account-budgets.ts`

**Interfaces:**
- Consumes: Task 3 的 API 形狀（GET 回 `accountBudgets`；PATCH 收 `{ accountBudgets: { [name]: number | null } }`）。
- Produces: `export function useAccountBudgets(): { budgets: Record<string, number>; saveBudget: (accountName: string, value: number | null) => Promise<boolean> }`。Task 5 的頁面與卡片依賴這個簽名。`saveBudget` 成功時同步更新本地狀態並回傳 `true`，失敗回傳 `false`（呼叫端顯示 inline 錯誤）。

專案無 React hook 測試設施（Vitest 只測純邏輯層），本 task 以型別檢查驗證，行為在 Task 5 手動驗證。

- [ ] **Step 1: 建立 hook**

建立 `src/hooks/use-account-budgets.ts`：

```ts
"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * 帳號手動月預算：掛載時從 GET /api/settings 載入，
 * saveBudget 以 PATCH merge 語意逐 key 儲存（value 為 null 表清除）。
 * 載入失敗時維持空物件（畫面與未設定時相同），不阻塞主資料呈現。
 */
export function useAccountBudgets() {
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.accountBudgets) {
          setBudgets(json.accountBudgets);
        }
      } catch {
        // 載入失敗時維持空物件，卡片落回 API 預算邏輯
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 儲存單一帳號月預算；value 為 null 表清除。回傳是否成功。 */
  const saveBudget = useCallback(
    async (accountName: string, value: number | null): Promise<boolean> => {
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountBudgets: { [accountName]: value } }),
        });
        if (!res.ok) return false;
        setBudgets((prev) => {
          const next = { ...prev };
          if (value === null) {
            delete next[accountName];
          } else {
            next[accountName] = value;
          }
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return { budgets, saveBudget };
}
```

- [ ] **Step 2: 驗證**

Run: `npx tsc --noEmit`
Expected: 乾淨。

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-account-budgets.ts
git commit -m "feat(initiatives): useAccountBudgets hook（GET 載入 + PATCH 單 key 儲存）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: /initiatives 前端整合（頁面資料流 + 帳號卡就地編輯）

**Files:**
- Modify: `src/app/initiatives/page.tsx`（`InitiativesContent` 內）
- Modify: `src/components/initiatives/account-pacing-cards.tsx`（整檔改寫）

**Interfaces:**
- Consumes: Task 1 的 `aggregateAccounts(records, days, { manualBudgets, daysInMonth })` 與 `AccountSummary.budgetSource` / `monthlyBudget`；Task 4 的 `useAccountBudgets()`。
- Produces: `AccountPacingCards` 新增必填 prop `onSaveBudget: (accountName: string, value: number | null) => Promise<boolean>`。KPI 卡（`initiative-kpi-cards.tsx`）彙總 `accounts` 的 `periodBudget`，手動值自動計入，**不需改動**。

**行為變更（spec 要求的必然結果）：** 原本「全部帳號都無進行中預算 → 整區收合成一行提示」的分支要移除——大部分帳號是 ABO 無 API 預算，這正是使用者需要點鉛筆填月預算的場景，收合會讓入口消失。無預算卡片本身已有「無進行中預算 · 花費 $X」空狀態。

- [ ] **Step 1: 頁面資料流接上 budgets**

`src/app/initiatives/page.tsx` 修改：

(1) import 加：

```ts
import { useAccountBudgets } from "@/hooks/use-account-budgets";
```

(2) `InitiativesContent` 內，`const days = useMemo(...)` 之前加：

```ts
  // 帳號手動月預算（budgets 載入前為空物件，畫面與現狀相同，載入後自動重算）
  const { budgets, saveBudget } = useAccountBudgets();

  // 當月天數（使用者本地時區），供手動月預算換算為期間預算
  const daysInMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, []);
```

(3) `accountSummaries` 的 useMemo 改為：

```ts
  const accountSummaries = useMemo(
    () => aggregateAccounts(data, days, { manualBudgets: budgets, daysInMonth }),
    [data, days, budgets, daysInMonth],
  );
```

(4) JSX 中 `<AccountPacingCards ...>` 加 prop：

```tsx
        <AccountPacingCards
          accounts={accountSummaries}
          selectedAccounts={selectedAccounts}
          onAccountsChange={onAccountsChange}
          onSaveBudget={saveBudget}
        />
```

- [ ] **Step 2: 改寫帳號卡元件**

`src/components/initiatives/account-pacing-cards.tsx` 整檔改寫為（注意：外層從 `<button>` 改為 `role="button"` 的 `<div>`，因為卡片內要放真正的 `<button>` 與 `<input>`，巢狀 button 是無效 HTML）：

```tsx
"use client";

import { useState } from "react";
import type { AccountSummary } from "@/lib/initiatives/types";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency } from "@/lib/utils/format";

interface AccountPacingCardsProps {
  accounts: AccountSummary[];
  selectedAccounts: string[];
  onAccountsChange: (accounts: string[]) => void;
  /** 儲存帳號手動月預算；value 為 null 表清除，回傳是否成功 */
  onSaveBudget: (accountName: string, value: number | null) => Promise<boolean>;
}

/**
 * 帳號預算配速卡片區：每帳號一張卡，點擊切換「只看該帳號」篩選；
 * hover 鉛筆鈕可就地編輯手動月預算（優先於 API 推算值）。
 */
export default function AccountPacingCards({
  accounts,
  selectedAccounts,
  onAccountsChange,
  onSaveBudget,
}: AccountPacingCardsProps) {
  // 就地編輯狀態（同時間只開一張卡）
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const isOnly = (name: string) =>
    selectedAccounts.length === 1 && selectedAccounts[0] === name;

  const startEdit = (a: AccountSummary) => {
    setEditing(a.accountName);
    setInputValue(
      a.budgetSource === "manual" ? String(a.monthlyBudget ?? "") : "",
    );
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setInputValue("");
    setEditError(null);
  };

  const handleSave = async (accountName: string) => {
    const trimmed = inputValue.trim();
    // 空值視為取消
    if (trimmed === "") {
      closeEdit();
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) {
      setEditError("請輸入大於 0、不超過 10 億的數字");
      return;
    }
    setSaving(true);
    setEditError(null);
    const ok = await onSaveBudget(accountName, value);
    setSaving(false);
    if (ok) closeEdit();
    else setEditError("儲存失敗，請重試");
  };

  const handleClear = async (accountName: string) => {
    setSaving(true);
    setEditError(null);
    const ok = await onSaveBudget(accountName, null);
    setSaving(false);
    if (ok) closeEdit();
    else setEditError("清除失敗，請重試");
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">帳號預算進度</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {accounts.map((a) => {
          const level = pacingLevel(a.progress);
          const pct = a.progress * 100;
          const selected = isOnly(a.accountName);
          const isEditing = editing === a.accountName;
          return (
            <div
              key={a.accountName}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isEditing) return;
                onAccountsChange(selected ? [] : [a.accountName]);
              }}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAccountsChange(selected ? [] : [a.accountName]);
                }
              }}
              className={`group relative text-left cursor-pointer bg-card border rounded-xl p-4 transition-all card-hover ${
                selected
                  ? "border-accent ring-1 ring-accent"
                  : "border-card-border"
              }`}
            >
              {!isEditing && (
                <button
                  type="button"
                  aria-label={`編輯 ${a.accountName} 的月預算`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(a);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-md text-muted hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
                    />
                  </svg>
                </button>
              )}
              <div className="text-xs text-muted truncate mb-1 pr-6">
                {a.accountName}
              </div>
              {isEditing ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="number"
                    autoFocus
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(a.accountName);
                      if (e.key === "Escape") closeEdit();
                    }}
                    placeholder="月預算（原幣別）"
                    disabled={saving}
                    className="w-full text-sm font-mono tabular-nums bg-background border border-card-border rounded-md px-2 py-1 focus:outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSave(a.accountName)}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {saving ? "儲存中…" : "儲存"}
                    </button>
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 rounded-md text-muted hover:text-foreground disabled:opacity-50"
                    >
                      取消
                    </button>
                    {a.budgetSource === "manual" && (
                      <button
                        type="button"
                        onClick={() => handleClear(a.accountName)}
                        disabled={saving}
                        className="text-[11px] px-2 py-0.5 rounded-md text-danger disabled:opacity-50 ml-auto"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  {editError && (
                    <p className="text-[11px] text-danger mt-1">{editError}</p>
                  )}
                </div>
              ) : a.hasBudget ? (
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
                  {a.budgetSource === "manual" && (
                    <div className="text-[11px] text-muted font-mono tabular-nums mt-0.5">
                      月預算 {formatCurrency(a.monthlyBudget ?? 0)}
                    </div>
                  )}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 靜態驗證**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 型別乾淨、全套件 PASS。

- [ ] **Step 4: 手動驗證（瀏覽器）**

先確認 dev server 執行中（`npm run dev`，未跑則背景啟動；Windsor API 首載約 60-80 秒）。開 `http://localhost:3000/initiatives` 驗證：

1. 無手動值時畫面與改動前相同（ABO 帳號顯示「無進行中預算」＋鉛筆可見於 hover）。
2. 對一個「無進行中預算」帳號點鉛筆 → 輸入 31000 → 儲存 → 卡片即時顯示 %、進度條與「月預算 $31,000」小字；KPI「期間預算」同步增加。
3. 重新整理頁面 → 手動值仍在（DB 持久化）。
4. 再點鉛筆 → 預填 31000 → 按「清除」→ 卡片回到「無進行中預算」。
5. 輸入 -5 或 0 → 顯示 inline 驗證錯誤（`text-danger`），不送出。
6. 點鉛筆或編輯區域不會觸發「點卡片切換帳號篩選」；點卡片其他區域仍會。

截圖存證（完成宣告必附驗證證據）。

- [ ] **Step 5: Commit**

```bash
git add src/app/initiatives/page.tsx src/components/initiatives/account-pacing-cards.tsx
git commit -m "feat(initiatives): 帳號卡就地編輯手動月預算 + 頁面資料流整合

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 紀錄

- **Spec 覆蓋**：已確認決策 1-4 → Task 1（換算與覆寫）、Task 2+3（儲存與 merge）、Task 4+5（就地編輯）；7 個測試案例 → Task 1 涵蓋 spec 測試 1-5、Task 2 涵蓋 6-7；KPI 連動不改（spec 明載）；錯誤處理三條 → Task 5 inline 錯誤、Task 2 Zod 拒絕、Task 1 daysInMonth 防呆。無缺口。
- **Placeholder 掃描**：所有程式碼步驟皆為完整可貼上的程式碼，無 TBD/TODO。
- **型別一致性**：`AccountBudgetOptions`、`budgetSource`、`monthlyBudget`、`mergeAccountBudgets`、`useAccountBudgets`、`onSaveBudget` 在各 task 間簽名一致。
- **Spec 外的必要決策**（審查時可挑戰）：(1) 移除「全部無預算收合成一行」分支——否則手動預算入口在最需要的場景消失；(2) schema/merge 抽成 `src/lib/settings/account-budgets.ts` 純函式模組——沿用 `thresholds` 放獨立模組的先例，讓 spec 測試 6-7 可以單測；(3) hook 回傳簡化為 `{ budgets, saveBudget }`（spec 原寫 saving/error 也由 hook 回傳）——saving/error 屬單張卡片的編輯狀態，放卡片元件 local state 才能支援逐卡獨立顯示，行為與 spec 的 UI 要求（disabled、inline 錯誤）等價。

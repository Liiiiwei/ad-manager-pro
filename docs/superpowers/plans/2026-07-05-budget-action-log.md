# 預算控管 × 操作紀錄閉環（方案 B）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 ad-manager-pro 自動記錄廣告帳戶預算變更、偵測配速超支並提醒，形成「偵測 → 提醒 → 處理 → 留下操作紀錄 → 自動對帳」的預算待辦閉環。

**Architecture:** 三張新表（快照 / 變更歷史 / 預算待辦）＋ 一個獨立的配速超支檢查（消費既有 `buildDailySummary` 已算好的帳號配速，不動 metric 規則引擎）＋ 掛進既有每日摘要 cron、LINE Flex、`/daily` 呈現。平台端預算變更靠比對每日拉到的 campaign budget 快照自動偵測；帳號月預算變更靠 `PATCH /api/settings` 時 diff 寫入。**不含 Windsor 寫回**（Phase 2）。

**Tech Stack:** Next.js 16、Prisma 7（driver adapter，schema 無 `datasource.url`）、Windsor 唯讀資料層、node-cron in-app 排程、LINE Messaging API Flex、Vitest。

## Global Constraints

- 顏色一律用設計 token（`bg-accent`/`text-muted`/`bg-danger`…），禁硬色票；品牌/動作＝靛 `accent`，資訊＝藍 `info`，超支/危險＝`danger`。LINE Flex 側用既有 `COLORS` 常數（`accent #4f46e5`、`danger #ef4444`、`success #22c55e`、`warning #f59e0b`）。
- 幣別 TWD、時區 Asia/Taipei；金額一律 `font-mono tabular-nums`（UI）／`formatCurrency()`（`@/lib/utils/format`）。
- 所有新 API 路由沿用既有慣例：`getCurrentUser()` 認證在 try 區塊最上方 + Zod `.safeParse()` 驗證（失敗回 400 + `parsed.error.flatten()`）+ 錯誤訊息一律繁體中文 + 生產環境不洩漏 `error.message`。
- 全程繁體中文（程式碼註解中文；禁日文假名、簡體字、不必要英文）。
- UI 四態：loading / error（含重試）/ empty / success。
- Prisma import 路徑：`import { prisma } from "@/lib/db/prisma";`（是 `db/prisma`，不是 `db`）。
- 新增 model 後需跑 `npx prisma db push` + `npx prisma generate`（`prisma.config.ts` 不需動）。
- **配速待辦只在每日 08:30 摘要跑一次**，不掛盤中異常檢查（`runAnomalyCheckForUser` 用 last_14d 無預算欄位）。
- 本期範圍（scope discipline，spec 第六節定案）：待辦 reason 只做 `pacing_overspend`；操作紀錄只記「預算數字變更」（不含暫停/開啟 campaign）；門檻固定 warning `>1.10`、critical `>1.25`；快照一天一次。
- **已知限制（寫入註解，不在本期修）**：(1) Windsor campaign 無穩定 ID，`entityKey` 用「平台 + 帳戶名 + 正規化 campaign 名稱」複合鍵（2026-07-05 使用者裁決：併入帳戶名，避免跨客戶同名 campaign 合併、操作紀錄歸錯客戶），「改名即視為新 campaign」的限制仍在；(2) 配速待辦不會因「帳號本月不再超支」自動關閉（例如跨月花費歸零），只透過自動對帳（偵測到平台改預算）或使用者手動 resolve/dismiss 關閉 —— 這是 spec 定案的取捨，留 Phase 2。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `prisma/schema.prisma`（改） | 3 個新 model + `User` 反向關聯 |
| `src/lib/budget/pacing.ts`（新） | 純函式：從 `AccountSummary[]` 偵測配速超支 |
| `src/lib/budget/action-items.ts`（新） | DB：配速待辦 upsert + 去重 + 計數 |
| `src/lib/budget/snapshot.ts`（新） | 純函式抽取/比對 campaign 預算 + DB：快照 sync + 平台變更 changelog + 自動對帳 |
| `src/lib/budget/account-budget-log.ts`（新） | 純函式 diff 帳號月預算 + DB：寫 changelog + 更新 account_monthly 快照 |
| `src/app/api/settings/route.ts`（改） | PATCH `accountBudgets` 時 diff 寫 changelog |
| `src/lib/line/flex.ts`（改） | `buildDigestFlex` 加「預算待辦」一行 |
| `src/lib/cron/monitor-jobs.ts`（改） | `runDailyDigestForUser` 內串接配速檢查 + 快照 sync + 傳待辦數給 flex |
| `src/app/api/budget/action-items/route.ts`（新） | GET 列待辦 |
| `src/app/api/budget/action-items/[id]/route.ts`（新） | PATCH resolve/dismiss |
| `src/app/api/budget/change-log/route.ts`（新） | GET 近期預算變更 |
| `src/app/daily/page.tsx`（改） | 「預算待辦」+「近期預算變更」兩區塊 |

---

## Task 1: Prisma schema — 3 個新 model + User 反向關聯

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `BudgetSnapshot` / `BudgetChangeLog` / `BudgetActionItem`（後續所有 DB task 使用 `prisma.budgetSnapshot` / `prisma.budgetChangeLog` / `prisma.budgetActionItem`）。快照複合唯一鍵在 upsert 用 `userId_scope_entityKey_budgetType`。

> **註（TDD 例外）：** schema 是設定型變更、無行為邏輯，本 task 不寫單元測試，驗收改用 `db push` + `generate` + `tsc`（下方 Step 3-4）。這是 TDD skill 允許的 config 例外。

- [ ] **Step 1: 在 `prisma/schema.prisma` 尾端加入 3 個 model**

```prisma
/// 預算數值快照（供比對用，每 (userId,scope,entityKey,budgetType) 只留最新一筆）
model BudgetSnapshot {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scope       String   // "campaign" | "account_monthly"
  platform    String   // meta / google（account_monthly 為 "manual"）
  entityKey   String   // campaign: 平台+帳戶名+正規化 campaign 名稱（複合鍵，避免跨帳戶同名合併）；account_monthly: 帳號名
  entityLabel String   // 顯示用名稱
  budgetType  String   // "daily" | "lifetime" | "monthly_manual"
  budgetValue Float
  capturedAt  DateTime @default(now())

  @@unique([userId, scope, entityKey, budgetType])
  @@index([userId])
}

/// 預算變更歷史（缺口一核心：誰在何時把哪個帳號/campaign 預算改成多少）
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
  previousValue Float?
  newValue      Float
  changePercent Float?
  note          String?
  detectedAt    DateTime @default(now())

  @@index([userId])
  @@index([detectedAt])
}

/// 預算待辦（閉環）
model BudgetActionItem {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  reason            String    // "pacing_overspend"
  platform          String    // all/meta/google
  accountName       String
  severity          String    // "warning" | "critical"
  detail            Json      // { monthSpend, periodBudget, pacingRatio, monthlyBudget }
  status            String    @default("open") // "open" | "resolved" | "dismissed"
  resolvedBy        String?   // "auto_detected_change" | "manual"
  linkedChangeLogId String?
  createdAt         DateTime  @default(now())
  resolvedAt        DateTime?

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

- [ ] **Step 2: 在 `User` model 加 3 個反向關聯欄位**

在 `User` model 既有欄位區塊內加入（放在其他 `@relation` 反向欄位附近）：

```prisma
  budgetSnapshots   BudgetSnapshot[]
  budgetChangeLogs  BudgetChangeLog[]
  budgetActionItems BudgetActionItem[]
```

- [ ] **Step 3: 同步 schema 到 DB 並重新產生 client**

Run: `npx prisma db push && npx prisma generate`
Expected: `db push` 顯示 3 張新表建立成功；`generate` 顯示 Prisma Client 產生成功、無錯誤。

- [ ] **Step 4: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無新錯誤（既有錯誤不算）。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(budget): 新增預算快照/變更歷史/待辦三張表"
```

---

## Task 2: 配速超支偵測（純函式）

**Files:**
- Create: `src/lib/budget/pacing.ts`
- Test: `src/lib/budget/__tests__/pacing.test.ts`

**Interfaces:**
- Consumes: `AccountSummary`（`@/lib/initiatives/types`，欄位 `accountName / platform / spend / periodBudget / hasBudget / progress / budgetSource: "manual"|"api"|undefined / monthlyBudget?: number`）。`progress = spend / periodBudget` 已是配速比。
- Produces: `detectPacingOverspend(accounts: AccountSummary[], thresholds?: PacingThresholds): PacingViolation[]`；型別 `PacingViolation`、`PacingThresholds`。

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from "vitest";
import { detectPacingOverspend } from "../pacing";
import type { AccountSummary } from "@/lib/initiatives/types";

function acc(overrides: Partial<AccountSummary>): AccountSummary {
  return {
    accountName: "測試帳號",
    platform: "Meta",
    spend: 0,
    periodBudget: 1000,
    hasBudget: true,
    progress: 0,
    budgetSource: "manual",
    monthlyBudget: 30000,
    ...overrides,
  };
}

describe("detectPacingOverspend", () => {
  it("配速比剛好 1.10 不算超支（門檻為嚴格大於）", () => {
    const result = detectPacingOverspend([acc({ progress: 1.10 })]);
    expect(result).toEqual([]);
  });

  it("1.10 < 比值 ≤ 1.25 標記 warning", () => {
    const result = detectPacingOverspend([acc({ progress: 1.2, spend: 1200 })]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("warning");
    expect(result[0].pacingRatio).toBe(1.2);
    expect(result[0].monthSpend).toBe(1200);
  });

  it("比值剛好 1.25 仍為 warning，大於 1.25 才 critical", () => {
    expect(detectPacingOverspend([acc({ progress: 1.25 })])[0].severity).toBe("warning");
    expect(detectPacingOverspend([acc({ progress: 1.26 })])[0].severity).toBe("critical");
  });

  it("未設手動月預算的帳號跳過（budgetSource 非 manual）", () => {
    const result = detectPacingOverspend([acc({ progress: 2, budgetSource: "api", monthlyBudget: undefined })]);
    expect(result).toEqual([]);
  });

  it("periodBudget 為 0 跳過（避免除零殘留）", () => {
    const result = detectPacingOverspend([acc({ progress: 2, periodBudget: 0, hasBudget: false })]);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/budget/__tests__/pacing.test.ts`
Expected: FAIL（`detectPacingOverspend` is not a function / 模組不存在）。

- [ ] **Step 3: 寫最小實作**

```typescript
import type { AccountSummary } from "@/lib/initiatives/types";

/** 配速超支門檻（比值為「本月累計花費 ÷ 當期應花額度」）*/
export interface PacingThresholds {
  /** 超過此值即 warning（嚴格大於）*/
  warning: number;
  /** 超過此值即 critical（嚴格大於）*/
  critical: number;
}

/** 一筆配速超支 */
export interface PacingViolation {
  accountName: string;
  platform: string;
  severity: "warning" | "critical";
  monthSpend: number;
  periodBudget: number;
  pacingRatio: number;
  monthlyBudget: number;
}

const DEFAULT_THRESHOLDS: PacingThresholds = { warning: 1.1, critical: 1.25 };

/**
 * 從帳號配速摘要偵測超支。只檢查有設「手動月預算」的帳號；
 * a.progress 已是 spend / periodBudget（見 buildDailySummary）。
 */
export function detectPacingOverspend(
  accounts: AccountSummary[],
  thresholds: PacingThresholds = DEFAULT_THRESHOLDS,
): PacingViolation[] {
  const violations: PacingViolation[] = [];
  for (const a of accounts) {
    if (a.budgetSource !== "manual" || a.monthlyBudget == null || a.periodBudget <= 0) {
      continue;
    }
    const ratio = a.progress;
    if (ratio <= thresholds.warning) continue;
    const severity: "warning" | "critical" =
      ratio > thresholds.critical ? "critical" : "warning";
    violations.push({
      accountName: a.accountName,
      platform: a.platform,
      severity,
      monthSpend: a.spend,
      periodBudget: a.periodBudget,
      pacingRatio: ratio,
      monthlyBudget: a.monthlyBudget,
    });
  }
  return violations;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/lib/budget/__tests__/pacing.test.ts`
Expected: PASS（5 個測試全綠）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/pacing.ts src/lib/budget/__tests__/pacing.test.ts
git commit -m "feat(budget): 配速超支偵測純函式"
```

---

## Task 3: 配速待辦持久化 + 去重（DB）

**Files:**
- Create: `src/lib/budget/action-items.ts`
- Test: `src/lib/budget/__tests__/action-items.test.ts`

**Interfaces:**
- Consumes: `PacingViolation`（Task 2）、`prisma.budgetActionItem`（Task 1）。
- Produces: `syncPacingActionItems(userId: string, violations: PacingViolation[]): Promise<number>`（回傳同步後該 user open 的 pacing 待辦筆數）。

- [ ] **Step 1: 寫失敗測試**（vi.mock DB 風格，仿 `monitor-jobs.test.ts`）

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetActionItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { syncPacingActionItems } from "../action-items";
import type { PacingViolation } from "../pacing";

const findMany = vi.mocked(prisma.budgetActionItem.findMany);
const create = vi.mocked(prisma.budgetActionItem.create);
const update = vi.mocked(prisma.budgetActionItem.update);
const count = vi.mocked(prisma.budgetActionItem.count);

function violation(overrides: Partial<PacingViolation> = {}): PacingViolation {
  return {
    accountName: "魔幻主義",
    platform: "Meta",
    severity: "warning",
    monthSpend: 12000,
    periodBudget: 10000,
    pacingRatio: 1.2,
    monthlyBudget: 30000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(1);
});

describe("syncPacingActionItems", () => {
  it("帳號無既有 open 待辦時建立新待辦", async () => {
    findMany.mockResolvedValue([]);
    await syncPacingActionItems("u1", [violation()]);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      reason: "pacing_overspend",
      accountName: "魔幻主義",
      severity: "warning",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("帳號已有 open 待辦時更新不新增（去重）", async () => {
    findMany.mockResolvedValue([
      { id: "item1", accountName: "魔幻主義" } as never,
    ]);
    await syncPacingActionItems("u1", [violation({ severity: "critical" })]);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "item1" },
      data: { severity: "critical" },
    });
  });

  it("回傳同步後 open 待辦筆數", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(3);
    const result = await syncPacingActionItems("u1", [violation()]);
    expect(result).toBe(3);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/budget/__tests__/action-items.test.ts`
Expected: FAIL（`syncPacingActionItems` 不存在）。

- [ ] **Step 3: 寫最小實作**

```typescript
import { prisma } from "@/lib/db/prisma";
import type { PacingViolation } from "./pacing";

/**
 * 同步配速待辦：同帳號已有 open 待辦則更新（去重），否則新建。
 * 回傳同步後該 user open 的 pacing 待辦總數。
 */
export async function syncPacingActionItems(
  userId: string,
  violations: PacingViolation[],
): Promise<number> {
  const existing = await prisma.budgetActionItem.findMany({
    where: { userId, reason: "pacing_overspend", status: "open" },
  });
  const openByAccount = new Map(existing.map((i) => [i.accountName, i]));

  for (const v of violations) {
    const detail = {
      monthSpend: v.monthSpend,
      periodBudget: v.periodBudget,
      pacingRatio: v.pacingRatio,
      monthlyBudget: v.monthlyBudget,
    };
    const current = openByAccount.get(v.accountName);
    if (current) {
      await prisma.budgetActionItem.update({
        where: { id: current.id },
        data: { severity: v.severity, platform: v.platform, detail },
      });
    } else {
      await prisma.budgetActionItem.create({
        data: {
          userId,
          reason: "pacing_overspend",
          platform: v.platform,
          accountName: v.accountName,
          severity: v.severity,
          detail,
        },
      });
    }
  }

  return prisma.budgetActionItem.count({
    where: { userId, reason: "pacing_overspend", status: "open" },
  });
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/lib/budget/__tests__/action-items.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/action-items.ts src/lib/budget/__tests__/action-items.test.ts
git commit -m "feat(budget): 配速待辦持久化與去重"
```

---

## Task 4: Campaign 預算抽取 + 快照比對（純函式）

> **⚠️ 2026-07-05 使用者裁決修正（已實作後調整）：** `extractCampaignBudgets` 的分組鍵與 `entityKey` 從「只用正規化 campaign 名」改為「平台 + 帳戶名 + 正規化 campaign 名」複合鍵（分隔字元 ``）。原因：Task 4 審查抓到跨帳戶／跨平台同名 campaign 會被合併（`Math.max`），導致操作紀錄歸錯客戶。下方 Step 1/3 的原始程式碼與測試以「campaign 名 only」寫成，實際碼與測試已依本註調整（`entityKey` 為複合鍵、`entityLabel` 含帳戶名、跨帳戶同名不合併）。Task 5 複合唯一鍵 `userId_scope_entityKey_budgetType` 與此新 `entityKey` 一致。

**Files:**
- Create: `src/lib/budget/snapshot.ts`
- Test: `src/lib/budget/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes: `WindsorAdRecord`（`@/lib/windsor/types`，欄位含 `campaign?: string`、`account_name?: string`、`source: string`、`campaignDailyBudget: number`、`campaignLifetimeBudget: number`）。
- Produces: `extractCampaignBudgets(records: WindsorAdRecord[]): CampaignBudget[]`、`diffCampaignBudgets(previous: SnapshotRecord[], current: CampaignBudget[]): DetectedChange[]`；型別 `CampaignBudget` / `SnapshotRecord` / `DetectedChange`。Task 5 的 `syncCampaignSnapshots` 消費這兩個純函式。

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from "vitest";
import { extractCampaignBudgets, diffCampaignBudgets } from "../snapshot";
import type { WindsorAdRecord } from "@/lib/windsor/types";

function rec(overrides: Partial<WindsorAdRecord>): WindsorAdRecord {
  return {
    date: "2026-07-04",
    source: "facebook",
    account_name: "魔幻主義",
    campaign: "夏季轉換",
    spend: 100,
    revenue: 0,
    conversions: 0,
    campaignDailyBudget: 0,
    campaignLifetimeBudget: 0,
    campaignStatus: "ACTIVE",
    ...overrides,
  } as WindsorAdRecord;
}

describe("extractCampaignBudgets", () => {
  it("同 campaign 跨日取最大預算，daily 與 lifetime 各產一筆", () => {
    const out = extractCampaignBudgets([
      rec({ campaignDailyBudget: 500, campaignLifetimeBudget: 0 }),
      rec({ date: "2026-07-05", campaignDailyBudget: 800, campaignLifetimeBudget: 20000 }),
    ]);
    expect(out).toContainEqual(expect.objectContaining({ entityKey: "夏季轉換", budgetType: "daily", budgetValue: 800 }));
    expect(out).toContainEqual(expect.objectContaining({ entityKey: "夏季轉換", budgetType: "lifetime", budgetValue: 20000 }));
  });

  it("預算為 0 的類型不產生快照條目", () => {
    const out = extractCampaignBudgets([rec({ campaignDailyBudget: 0, campaignLifetimeBudget: 0 })]);
    expect(out).toEqual([]);
  });

  it("平台正規化為 meta / google", () => {
    const out = extractCampaignBudgets([
      rec({ source: "facebook", campaignDailyBudget: 100 }),
      rec({ source: "google_ads", campaign: "搜尋", campaignDailyBudget: 200 }),
    ]);
    expect(out.find((c) => c.entityKey === "夏季轉換")?.platform).toBe("meta");
    expect(out.find((c) => c.entityKey === "搜尋")?.platform).toBe("google");
  });
});

describe("diffCampaignBudgets", () => {
  const current = [
    { entityKey: "夏季轉換", entityLabel: "夏季轉換", platform: "meta", accountName: "魔幻主義", budgetType: "daily" as const, budgetValue: 800 },
  ];

  it("首見（無快照）不算變更", () => {
    expect(diffCampaignBudgets([], current)).toEqual([]);
  });

  it("值改變時產生一筆變更並計算變動百分比", () => {
    const changes = diffCampaignBudgets(
      [{ entityKey: "夏季轉換", budgetType: "daily", budgetValue: 400 }],
      current,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ previousValue: 400, newValue: 800, changePercent: 100 });
    expect(changes[0].accountName).toBe("魔幻主義");
  });

  it("值相同不算變更", () => {
    const changes = diffCampaignBudgets(
      [{ entityKey: "夏季轉換", budgetType: "daily", budgetValue: 800 }],
      current,
    );
    expect(changes).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/budget/__tests__/snapshot.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 寫最小實作**

```typescript
import type { WindsorAdRecord } from "@/lib/windsor/types";

/** 一個 campaign 的一種預算類型快照值 */
export interface CampaignBudget {
  /** 複合鍵：平台帳戶名正規化 campaign 名稱（2026-07-05 使用者裁決併入帳戶名，避免跨帳戶同名合併；無穩定 ID，改名視為新 campaign — 已知限制）*/
  entityKey: string;
  entityLabel: string;
  platform: string;
  accountName: string;
  budgetType: "daily" | "lifetime";
  budgetValue: number;
}

/** DB 讀出的既有快照（比對只需這三欄）*/
export interface SnapshotRecord {
  entityKey: string;
  budgetType: string;
  budgetValue: number;
}

/** 偵測到的一筆平台端預算變更 */
export interface DetectedChange {
  entityKey: string;
  entityLabel: string;
  platform: string;
  accountName: string;
  budgetType: string;
  previousValue: number;
  newValue: number;
  changePercent: number | null;
}

/** 平台名正規化（避免耦合 transform 內部 helper，4 行重複可接受）*/
function platformOf(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("google")) return "google";
  if (s.includes("face") || s.includes("insta") || s.includes("meta")) return "meta";
  return source;
}

/** 從 Windsor 記錄抽取各 campaign 的當前預算（跨日取最大，比照 transform 快照邏輯）*/
export function extractCampaignBudgets(records: WindsorAdRecord[]): CampaignBudget[] {
  const map = new Map<
    string,
    { label: string; platform: string; accountName: string; daily: number; lifetime: number }
  >();
  for (const r of records) {
    const name = r.campaign?.trim() || "未命名";
    let acc = map.get(name);
    if (!acc) {
      acc = {
        label: name,
        platform: platformOf(r.source),
        accountName: r.account_name?.trim() || "未命名帳戶",
        daily: 0,
        lifetime: 0,
      };
      map.set(name, acc);
    }
    acc.daily = Math.max(acc.daily, r.campaignDailyBudget || 0);
    acc.lifetime = Math.max(acc.lifetime, r.campaignLifetimeBudget || 0);
  }

  const out: CampaignBudget[] = [];
  for (const [key, v] of map) {
    if (v.daily > 0) {
      out.push({ entityKey: key, entityLabel: v.label, platform: v.platform, accountName: v.accountName, budgetType: "daily", budgetValue: v.daily });
    }
    if (v.lifetime > 0) {
      out.push({ entityKey: key, entityLabel: v.label, platform: v.platform, accountName: v.accountName, budgetType: "lifetime", budgetValue: v.lifetime });
    }
  }
  return out;
}

/** 比對既有快照與當前值，回傳有變化的條目（首見不算變更）*/
export function diffCampaignBudgets(
  previous: SnapshotRecord[],
  current: CampaignBudget[],
): DetectedChange[] {
  const prevMap = new Map(previous.map((p) => [`${p.entityKey}|${p.budgetType}`, p.budgetValue]));
  const changes: DetectedChange[] = [];
  for (const c of current) {
    const key = `${c.entityKey}|${c.budgetType}`;
    if (!prevMap.has(key)) continue; // 首見 → baseline，不算變更
    const prev = prevMap.get(key)!;
    if (prev === c.budgetValue) continue;
    changes.push({
      entityKey: c.entityKey,
      entityLabel: c.entityLabel,
      platform: c.platform,
      accountName: c.accountName,
      budgetType: c.budgetType,
      previousValue: prev,
      newValue: c.budgetValue,
      changePercent: prev !== 0 ? ((c.budgetValue - prev) / prev) * 100 : null,
    });
  }
  return changes;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/lib/budget/__tests__/snapshot.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/snapshot.ts src/lib/budget/__tests__/snapshot.test.ts
git commit -m "feat(budget): campaign 預算抽取與快照比對純函式"
```

---

## Task 5: 快照 sync + 平台變更 changelog + 自動對帳（DB）

**Files:**
- Modify: `src/lib/budget/snapshot.ts`（加 `syncCampaignSnapshots`）
- Test: `src/lib/budget/__tests__/snapshot-sync.test.ts`

**Interfaces:**
- Consumes: `extractCampaignBudgets` / `diffCampaignBudgets`（Task 4）、`prisma.budgetSnapshot` / `prisma.budgetChangeLog` / `prisma.budgetActionItem`（Task 1）。
- Produces: `syncCampaignSnapshots(userId: string, current: CampaignBudget[]): Promise<number>`（回傳偵測到的變更筆數）。副作用：寫 `platform_detected` changelog、對變更帳號關閉 open 的 pacing 待辦（`resolvedBy: "auto_detected_change"`）、upsert 所有 current 快照。

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
    budgetChangeLog: { create: vi.fn() },
    budgetActionItem: { updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { syncCampaignSnapshots, type CampaignBudget } from "../snapshot";

const snapFindMany = vi.mocked(prisma.budgetSnapshot.findMany);
const snapUpsert = vi.mocked(prisma.budgetSnapshot.upsert);
const logCreate = vi.mocked(prisma.budgetChangeLog.create);
const itemUpdateMany = vi.mocked(prisma.budgetActionItem.updateMany);

const current: CampaignBudget[] = [
  { entityKey: "夏季轉換", entityLabel: "夏季轉換", platform: "meta", accountName: "魔幻主義", budgetType: "daily", budgetValue: 800 },
];

beforeEach(() => {
  vi.clearAllMocks();
  logCreate.mockResolvedValue({ id: "log1" } as never);
});

describe("syncCampaignSnapshots", () => {
  it("首見（無既有快照）只建 baseline 快照，不寫 changelog、不對帳", async () => {
    snapFindMany.mockResolvedValue([]);
    const changed = await syncCampaignSnapshots("u1", current);
    expect(changed).toBe(0);
    expect(logCreate).not.toHaveBeenCalled();
    expect(itemUpdateMany).not.toHaveBeenCalled();
    expect(snapUpsert).toHaveBeenCalledOnce();
  });

  it("偵測到值變更時寫 changelog 並關閉該帳號 open 待辦（自動對帳）", async () => {
    snapFindMany.mockResolvedValue([
      { entityKey: "夏季轉換", budgetType: "daily", budgetValue: 400 } as never,
    ]);
    const changed = await syncCampaignSnapshots("u1", current);
    expect(changed).toBe(1);
    expect(logCreate.mock.calls[0][0].data).toMatchObject({
      source: "platform_detected",
      previousValue: 400,
      newValue: 800,
    });
    expect(itemUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "u1", accountName: "魔幻主義", reason: "pacing_overspend", status: "open" },
      data: { status: "resolved", resolvedBy: "auto_detected_change", linkedChangeLogId: "log1" },
    });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/budget/__tests__/snapshot-sync.test.ts`
Expected: FAIL（`syncCampaignSnapshots` 不存在）。

- [ ] **Step 3: 在 `src/lib/budget/snapshot.ts` 追加實作**

在檔案頂端 import 加上 prisma，並在檔尾新增函式：

```typescript
import { prisma } from "@/lib/db/prisma";
```

```typescript
/**
 * 同步 campaign 快照：偵測平台端預算變更 → 寫 changelog + 自動對帳關閉待辦 → upsert 快照。
 * 回傳偵測到的變更筆數。
 */
export async function syncCampaignSnapshots(
  userId: string,
  current: CampaignBudget[],
): Promise<number> {
  const previous = await prisma.budgetSnapshot.findMany({
    where: { userId, scope: "campaign" },
    select: { entityKey: true, budgetType: true, budgetValue: true },
  });
  const changes = diffCampaignBudgets(previous, current);

  for (const ch of changes) {
    const log = await prisma.budgetChangeLog.create({
      data: {
        userId,
        source: "platform_detected",
        scope: "campaign",
        platform: ch.platform,
        entityKey: ch.entityKey,
        entityLabel: ch.entityLabel,
        budgetType: ch.budgetType,
        previousValue: ch.previousValue,
        newValue: ch.newValue,
        changePercent: ch.changePercent,
      },
    });
    // 自動對帳：系統偵測到平台端已調整此帳號預算，視為對應待辦已處理
    await prisma.budgetActionItem.updateMany({
      where: { userId, accountName: ch.accountName, reason: "pacing_overspend", status: "open" },
      data: {
        status: "resolved",
        resolvedBy: "auto_detected_change",
        linkedChangeLogId: log.id,
        resolvedAt: new Date(),
      },
    });
  }

  // upsert 所有當前值（含首見 baseline）為最新快照
  for (const c of current) {
    await prisma.budgetSnapshot.upsert({
      where: {
        userId_scope_entityKey_budgetType: {
          userId,
          scope: "campaign",
          entityKey: c.entityKey,
          budgetType: c.budgetType,
        },
      },
      create: {
        userId,
        scope: "campaign",
        platform: c.platform,
        entityKey: c.entityKey,
        entityLabel: c.entityLabel,
        budgetType: c.budgetType,
        budgetValue: c.budgetValue,
      },
      update: { budgetValue: c.budgetValue, entityLabel: c.entityLabel, platform: c.platform, capturedAt: new Date() },
    });
  }

  return changes.length;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/lib/budget/__tests__/snapshot-sync.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/snapshot.ts src/lib/budget/__tests__/snapshot-sync.test.ts
git commit -m "feat(budget): 快照同步+平台變更紀錄+自動對帳"
```

---

## Task 6: 帳號月預算變更紀錄（PATCH /api/settings）

**Files:**
- Create: `src/lib/budget/account-budget-log.ts`
- Test: `src/lib/budget/__tests__/account-budget-log.test.ts`
- Modify: `src/app/api/settings/route.ts`（PATCH，約 :198-205 既有 `updateData.accountBudgets = mergeAccountBudgets(...)` 附近；`user` 於 :135）

**Interfaces:**
- Consumes: `prisma.budgetChangeLog` / `prisma.budgetSnapshot`（Task 1）；`mergeAccountBudgets`（`@/lib/settings/account-budgets`）。
- Produces: `diffAccountBudgets(previous: Record<string, number>, next: Record<string, number>): AccountBudgetChange[]`、`logAccountBudgetChanges(userId: string, changes: AccountBudgetChange[]): Promise<void>`；型別 `AccountBudgetChange`。

- [ ] **Step 1: 寫純函式失敗測試**

```typescript
import { describe, it, expect } from "vitest";
import { diffAccountBudgets } from "../account-budget-log";

describe("diffAccountBudgets", () => {
  it("新增帳號預算：previousValue 為 null", () => {
    const changes = diffAccountBudgets({}, { 魔幻主義: 30000 });
    expect(changes).toEqual([{ accountName: "魔幻主義", previousValue: null, newValue: 30000 }]);
  });

  it("修改既有預算：帶出新舊值", () => {
    const changes = diffAccountBudgets({ 魔幻主義: 30000 }, { 魔幻主義: 45000 });
    expect(changes).toEqual([{ accountName: "魔幻主義", previousValue: 30000, newValue: 45000 }]);
  });

  it("移除帳號預算：newValue 為 null", () => {
    const changes = diffAccountBudgets({ 魔幻主義: 30000 }, {});
    expect(changes).toEqual([{ accountName: "魔幻主義", previousValue: 30000, newValue: null }]);
  });

  it("值不變的帳號不產生變更", () => {
    expect(diffAccountBudgets({ A: 100, B: 200 }, { A: 100, B: 999 })).toEqual([
      { accountName: "B", previousValue: 200, newValue: 999 },
    ]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/budget/__tests__/account-budget-log.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 寫實作**

```typescript
import { prisma } from "@/lib/db/prisma";

/** 一筆帳號月預算變更（newValue 為 null 代表移除）*/
export interface AccountBudgetChange {
  accountName: string;
  previousValue: number | null;
  newValue: number | null;
}

/** 比對前後帳號月預算表，回傳有變化的帳號 */
export function diffAccountBudgets(
  previous: Record<string, number>,
  next: Record<string, number>,
): AccountBudgetChange[] {
  const changes: AccountBudgetChange[] = [];
  const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const name of names) {
    const prev = name in previous ? previous[name] : null;
    const nv = name in next ? next[name] : null;
    if (prev === nv) continue;
    changes.push({ accountName: name, previousValue: prev, newValue: nv });
  }
  return changes;
}

/** 寫入手動月預算變更紀錄並同步 account_monthly 快照 */
export async function logAccountBudgetChanges(
  userId: string,
  changes: AccountBudgetChange[],
): Promise<void> {
  for (const ch of changes) {
    const removed = ch.newValue == null;
    const changePercent =
      ch.previousValue != null && ch.previousValue !== 0 && ch.newValue != null
        ? ((ch.newValue - ch.previousValue) / ch.previousValue) * 100
        : null;
    await prisma.budgetChangeLog.create({
      data: {
        userId,
        source: "manual_account_budget",
        scope: "account_monthly",
        platform: "manual",
        entityKey: ch.accountName,
        entityLabel: ch.accountName,
        budgetType: "monthly_manual",
        previousValue: ch.previousValue,
        newValue: ch.newValue ?? 0, // 移除以 0 表示（schema newValue 非 null）
        changePercent,
        note: removed ? "已移除月預算" : undefined,
      },
    });

    if (removed) {
      await prisma.budgetSnapshot.deleteMany({
        where: { userId, scope: "account_monthly", entityKey: ch.accountName, budgetType: "monthly_manual" },
      });
    } else {
      await prisma.budgetSnapshot.upsert({
        where: {
          userId_scope_entityKey_budgetType: {
            userId,
            scope: "account_monthly",
            entityKey: ch.accountName,
            budgetType: "monthly_manual",
          },
        },
        create: {
          userId,
          scope: "account_monthly",
          platform: "manual",
          entityKey: ch.accountName,
          entityLabel: ch.accountName,
          budgetType: "monthly_manual",
          budgetValue: ch.newValue!,
        },
        update: { budgetValue: ch.newValue!, capturedAt: new Date() },
      });
    }
  }
}
```

- [ ] **Step 4: 執行純函式測試通過**

Run: `npx vitest run src/lib/budget/__tests__/account-budget-log.test.ts`
Expected: PASS（4 個測試綠）。

- [ ] **Step 5: 接進 PATCH /api/settings**

先 import：

```typescript
import { diffAccountBudgets, logAccountBudgetChanges } from "@/lib/budget/account-budget-log";
```

找到既有處理 `accountBudgets` 的區塊（`updateData.accountBudgets = mergeAccountBudgets(existingSettings.accountBudgets, data.accountBudgets)` 這行；`existingSettings` 為 PATCH 內先讀出的當前設定物件，變數名以實際檔案為準）。在該行**之後**插入 diff 與紀錄：

```typescript
    // 記錄帳號月預算變更（缺口一：手動改預算留痕）
    const previousBudgets = mergeAccountBudgets(existingSettings.accountBudgets, {});
    const nextBudgets = mergeAccountBudgets(existingSettings.accountBudgets, data.accountBudgets);
    updateData.accountBudgets = nextBudgets;
    const budgetChanges = diffAccountBudgets(previousBudgets, nextBudgets);
    if (budgetChanges.length > 0) {
      await logAccountBudgetChanges(user.id, budgetChanges);
    }
```

> 注意：`previousBudgets` 必須在覆寫 `updateData.accountBudgets` 之前、以尚未合併的 `existingSettings.accountBudgets` 求得（`mergeAccountBudgets(existing, {})` 回傳既有值的乾淨副本）。若既有程式碼只在 `data.accountBudgets` 存在時才執行這段，保持相同的條件包裹。

- [ ] **Step 6: 型別檢查 + 全測試**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 無新型別錯誤；全測試綠。

- [ ] **Step 7: Commit**

```bash
git add src/lib/budget/account-budget-log.ts src/lib/budget/__tests__/account-budget-log.test.ts src/app/api/settings/route.ts
git commit -m "feat(budget): 帳號月預算變更留痕"
```

---

## Task 7: LINE Flex 加「預算待辦」一行

**Files:**
- Modify: `src/lib/line/flex.ts`（`buildDigestFlex`，約 :135-220；「異常」kvRow 於 :202-206、`return { type: "bubble" }` 於 :209）
- Test: `src/lib/line/__tests__/flex.test.ts`（若既有測試檔在別處，以 `find src -name 'flex*.test.*'` 確認後沿用）

**Interfaces:**
- Consumes: `DailySummary`（`@/lib/digest/build-daily-summary`）、既有 `COLORS` / `kvRow`。
- Produces: `buildDigestFlex(summary: DailySummary, appUrl: string, budgetActionItemCount?: number)` — 新增第三個可選參數（預設 0），Task 8 呼叫時傳入。

- [ ] **Step 1: 寫失敗測試**（先確認既有 flex 測試風格；若無 flex 測試檔則新建，import 真實 `buildDigestFlex` 與最小 `DailySummary`）

```typescript
import { describe, it, expect } from "vitest";
import { buildDigestFlex } from "../flex";
import type { DailySummary } from "@/lib/digest/build-daily-summary";

function summary(): DailySummary {
  return {
    date: "2026-07-04",
    yesterdaySpend: 1000,
    yesterdayRoas: 2,
    yesterdayCpa: 50,
    monthSpend: 20000,
    monthBudget: 30000,
    monthProgress: 0.66,
    accounts: [],
    alerts: [],
  };
}

/** 遞迴找出所有 text 節點的文字 */
function allTexts(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.contents)) n.contents.forEach(walk);
    if (n.body) walk(n.body);
  };
  walk(node);
  return out;
}

describe("buildDigestFlex 預算待辦行", () => {
  it("有待辦時顯示筆數", () => {
    const flex = buildDigestFlex(summary(), "https://app.test", 3);
    const texts = allTexts(flex);
    expect(texts).toContain("預算待辦");
    expect(texts).toContain("3 筆");
  });

  it("未傳待辦數時預設 0 筆", () => {
    const texts = allTexts(buildDigestFlex(summary(), "https://app.test"));
    expect(texts).toContain("0 筆");
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/line/__tests__/flex.test.ts`
Expected: FAIL（缺「預算待辦」文字，或第三參數未支援）。

- [ ] **Step 3: 修改 `buildDigestFlex`**

1. 簽章加第三參數：

```typescript
export function buildDigestFlex(
  summary: DailySummary,
  appUrl: string,
  budgetActionItemCount = 0,
): FlexMessage {
```

2. 在既有「異常」`kvRow(...)`（:202-206）之後、組出 bubble 的 `return`（:209）之前，加入一行：

```typescript
  bodyContents.push(
    kvRow(
      "預算待辦",
      `${budgetActionItemCount} 筆`,
      budgetActionItemCount > 0 ? COLORS.danger : COLORS.success,
    ),
  );
```

> 以實際檔案的 body 陣列變數名為準（可能是 `bodyContents` 或直接 inline 於 `contents` 陣列）。若異常行是 inline 寫在 `contents: [...]` 陣列字面值裡，則在異常那筆之後、同陣列內加入上述 `kvRow("預算待辦", ...)`（去掉 `bodyContents.push(...)` 外殼）。

- [ ] **Step 4: 執行確認通過 + 全測試**

Run: `npx vitest run src/lib/line/__tests__/flex.test.ts && npx vitest run`
Expected: PASS；其餘既有 flex 測試不受影響。

- [ ] **Step 5: Commit**

```bash
git add src/lib/line/flex.ts src/lib/line/__tests__/flex.test.ts
git commit -m "feat(budget): LINE 摘要加預算待辦行"
```

---

## Task 8: Cron 整合（每日摘要串接配速檢查 + 快照 sync）

**Files:**
- Modify: `src/lib/cron/monitor-jobs.ts`（`runDailyDigestForUser`，:74-141）
- Test: `src/lib/cron/__tests__/monitor-jobs.test.ts`（沿用既有檔，補測）

**Interfaces:**
- Consumes: `detectPacingOverspend`（Task 2）、`syncPacingActionItems`（Task 3）、`extractCampaignBudgets` / `syncCampaignSnapshots`（Task 4/5）、`buildDigestFlex` 第三參數（Task 7）、`prisma.budgetActionItem`。
- 現有函式內既有變數：`records`（Windsor `result.data`）、`summary`（`buildDailySummary` 結果）、`settings.userId`、`now`、`appUrl`。

- [ ] **Step 1: 補失敗測試**（在既有 monitor-jobs.test.ts 內新增；mock 需補 budget 相關模型/模組）

於檔案頂端 mock 區補上（若既有 `vi.mock("@/lib/db/prisma", ...)` 已存在，將 budget 模型併入同一個 factory）：

```typescript
vi.mock("@/lib/budget/action-items", () => ({ syncPacingActionItems: vi.fn().mockResolvedValue(2) }));
vi.mock("@/lib/budget/snapshot", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/budget/snapshot")>();
  return { ...actual, syncCampaignSnapshots: vi.fn().mockResolvedValue(0) };
});
```

並在 `prisma` mock 的物件補 `budgetActionItem: { count: vi.fn().mockResolvedValue(2) }`。

新增測試（沿用既有 `makeSettings` fixture 與 Windsor mock）：

```typescript
import { syncPacingActionItems } from "@/lib/budget/action-items";
import { syncCampaignSnapshots } from "@/lib/budget/snapshot";

it("每日摘要會跑配速檢查與快照同步", async () => {
  // 安排：linePushEnabled 的 settings 一筆 + Windsor 回一批含月預算超支的記錄
  //（沿用檔內既有 arrange 寫法，設 manualBudgets 使某帳號 progress > 1.1）
  await runDailyDigestForAllUsers(new Date("2026-07-05T00:30:00+08:00"));
  expect(syncPacingActionItems).toHaveBeenCalled();
  expect(syncCampaignSnapshots).toHaveBeenCalled();
});
```

> 若既有測試已對 `runDailyDigestForAllUsers` 有完整 arrange，複用它的 fixture，只加這條斷言即可。重點是驗證兩個 sync 函式被呼叫。

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/lib/cron/__tests__/monitor-jobs.test.ts`
Expected: FAIL（sync 函式未被呼叫）。

- [ ] **Step 3: 在 `runDailyDigestForUser` 插入串接**

先 import：

```typescript
import { detectPacingOverspend } from "@/lib/budget/pacing";
import { syncPacingActionItems } from "@/lib/budget/action-items";
import { extractCampaignBudgets, syncCampaignSnapshots } from "@/lib/budget/snapshot";
```

在 `const summary = buildDailySummary(...)` 之後、組 Flex／推播之前插入：

```typescript
  // 預算閉環：配速超支偵測 → 待辦；平台預算變更 → 快照/紀錄/自動對帳
  const violations = detectPacingOverspend(summary.accounts);
  await syncPacingActionItems(settings.userId, violations);
  await syncCampaignSnapshots(settings.userId, extractCampaignBudgets(records));
  const budgetActionItemCount = await prisma.budgetActionItem.count({
    where: { userId: settings.userId, reason: "pacing_overspend", status: "open" },
  });
```

> 順序重要：先 `syncPacingActionItems`（可能新建待辦），再 `syncCampaignSnapshots`（可能自動對帳關閉待辦），最後 `count` 取淨值。

將既有 `buildDigestFlex(summary, appUrl)` 呼叫改為傳入待辦數：

```typescript
  const flex = buildDigestFlex(summary, appUrl, budgetActionItemCount);
```

> 以實際檔案中組 Flex 的那行為準（變數名 `flex` 或直接 inline 傳給 `pushFlex`）。

- [ ] **Step 4: 執行確認通過 + 全測試**

Run: `npx vitest run src/lib/cron/__tests__/monitor-jobs.test.ts && npx vitest run`
Expected: PASS；全測試綠。

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron/monitor-jobs.ts src/lib/cron/__tests__/monitor-jobs.test.ts
git commit -m "feat(budget): 每日摘要串接配速檢查與快照同步"
```

---

## Task 9: 預算 API 路由（3 支）

**Files:**
- Create: `src/app/api/budget/action-items/route.ts`（GET）
- Create: `src/app/api/budget/action-items/[id]/route.ts`（PATCH）
- Create: `src/app/api/budget/change-log/route.ts`（GET）
- Test: `src/app/api/budget/__tests__/action-items.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`（`@/lib/auth/clerk`）、`prisma.budgetActionItem` / `prisma.budgetChangeLog`、`zod`。
- Produces: 3 個 route handler。PATCH 接受 `{ status: "resolved" | "dismissed" }`，只更新屬於當前 user 的待辦（`updateMany` where 帶 `userId` 防越權）。

- [ ] **Step 1: 寫失敗測試**（route handler 直接 import 呼叫，mock prisma 與 auth）

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    budgetActionItem: { findMany: vi.fn(), updateMany: vi.fn() },
    budgetChangeLog: { findMany: vi.fn() },
  },
}));

import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { GET } from "../action-items/route";
import { PATCH } from "../action-items/[id]/route";

const currentUser = vi.mocked(getCurrentUser);
const findMany = vi.mocked(prisma.budgetActionItem.findMany);
const updateMany = vi.mocked(prisma.budgetActionItem.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue({ id: "u1" } as never);
});

describe("GET /api/budget/action-items", () => {
  it("回傳當前 user 的待辦", async () => {
    findMany.mockResolvedValue([{ id: "a1", accountName: "魔幻主義" }] as never);
    const res = await GET(new Request("http://t/api/budget/action-items") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(findMany.mock.calls[0][0].where.userId).toBe("u1");
  });
});

describe("PATCH /api/budget/action-items/[id]", () => {
  it("resolve 帶 userId 防越權", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);
    const req = new Request("http://t/api/budget/action-items/a1", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "a1" }) } as never);
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ id: "a1", userId: "u1" });
    expect(updateMany.mock.calls[0][0].data.status).toBe("resolved");
  });

  it("非法 status 回 400", async () => {
    const req = new Request("http://t/api/budget/action-items/a1", {
      method: "PATCH",
      body: JSON.stringify({ status: "bogus" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "a1" }) } as never);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/app/api/budget/__tests__/action-items.test.ts`
Expected: FAIL（route 模組不存在）。

- [ ] **Step 3: 實作 GET action-items** — `src/app/api/budget/action-items/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const status = request.nextUrl.searchParams.get("status") ?? "open";
    const items = await prisma.budgetActionItem.findMany({
      where: { userId: user.id, status },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("讀取預算待辦失敗:", error);
    return NextResponse.json(
      {
        error: "讀取預算待辦失敗",
        details:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}
```

> 注意 test 用 `new Request(...)` 而非 `NextRequest`；handler 讀 `request.nextUrl` 在 Next 環境成立。測試若因 `nextUrl` 不存在而失敗，改用 `new URL(request.url).searchParams`（更通用，建議直接採此寫法）：`const status = new URL(request.url).searchParams.get("status") ?? "open";` 並把參數型別改回 `Request`。

- [ ] **Step 4: 實作 PATCH action-items/[id]** — `src/app/api/budget/action-items/[id]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請求格式錯誤", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await prisma.budgetActionItem.updateMany({
      where: { id, userId: user.id },
      data: {
        status: parsed.data.status,
        resolvedBy: "manual",
        resolvedAt: new Date(),
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "找不到待辦或無權限" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新預算待辦失敗:", error);
    return NextResponse.json(
      {
        error: "更新預算待辦失敗",
        details:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: 實作 GET change-log** — `src/app/api/budget/change-log/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const limitRaw = new URL(request.url).searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 100);
    const changes = await prisma.budgetChangeLog.findMany({
      where: { userId: user.id },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ changes });
  } catch (error) {
    console.error("讀取預算變更紀錄失敗:", error);
    return NextResponse.json(
      {
        error: "讀取預算變更紀錄失敗",
        details:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: 執行確認通過 + 全測試**

Run: `npx vitest run src/app/api/budget/__tests__/action-items.test.ts && npx vitest run`
Expected: PASS。

> 若 GET 測試因 `request.nextUrl` 在純 `Request` 下為 undefined 而失敗，採 Step 3 註記的 `new URL(request.url)` 寫法。

- [ ] **Step 7: Commit**

```bash
git add src/app/api/budget
git commit -m "feat(budget): 待辦與變更紀錄 API 路由"
```

---

## Task 10: /daily 兩個新區塊

**Files:**
- Modify: `src/app/daily/page.tsx`（在「今日異常」卡片 :214-237 之後加「預算待辦」；在「快速連結」:240-253 之前加「近期預算變更」）
- Test: 以既有 `/daily` 測試策略為準（此頁主要靠 hook + fetch，無既有單元測試則本 task 以 `npx tsc --noEmit` + build 驗收，並於 final review 由瀏覽器驗證四態；不硬造 component 測試）

**Interfaces:**
- Consumes: `GET /api/budget/action-items`、`GET /api/budget/change-log`（Task 9）、`PATCH /api/budget/action-items/[id]`（Task 9）、`formatCurrency`（`@/lib/utils/format`，本頁已 import）。

> 本頁「今日異常」已用獨立 `useEffect` fetch `/api/alerts/notifications?limit=50` 的模式（不塞進 `buildDailySummary`）。兩個新區塊沿用同一模式，各自 fetch。

- [ ] **Step 1: 在 `DailyContent`（success 區塊）內加入 state 與 fetch**

於既有「今日異常」的 state/effect 附近，仿造加入：

```tsx
  const [budgetItems, setBudgetItems] = useState<
    { id: string; accountName: string; severity: string; detail: { pacingRatio: number; monthSpend: number; periodBudget: number } }[]
  >([]);
  const [budgetChanges, setBudgetChanges] = useState<
    { id: string; source: string; entityLabel: string; previousValue: number | null; newValue: number; detectedAt: string }[]
  >([]);

  const loadBudget = useCallback(async () => {
    const [itemsRes, changesRes] = await Promise.all([
      fetch("/api/budget/action-items?status=open"),
      fetch("/api/budget/change-log?limit=10"),
    ]);
    if (itemsRes.ok) setBudgetItems((await itemsRes.json()).items);
    if (changesRes.ok) setBudgetChanges((await changesRes.json()).changes);
  }, []);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  async function updateBudgetItem(id: string, status: "resolved" | "dismissed") {
    const res = await fetch(`/api/budget/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) loadBudget();
  }
```

> 確認 `useState` / `useEffect` / `useCallback` 已 import（本頁應已用 `useEffect`；缺的補進既有 `import { ... } from "react"`）。

- [ ] **Step 2: 加「預算待辦」卡片**（放在今日異常卡片之後）

```tsx
        <div className="bg-card border border-card-border rounded-xl p-4">
          <h2 className="font-display text-base font-semibold text-foreground mb-3">預算待辦</h2>
          {budgetItems.length === 0 ? (
            <p className="text-sm text-muted">目前沒有需要處理的預算。</p>
          ) : (
            <ul className="space-y-3">
              {budgetItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-danger/10 border border-danger/20 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.accountName}
                      <span className="ml-2 text-danger font-mono tabular-nums">
                        配速 {Math.round(item.detail.pacingRatio * 100)}%
                      </span>
                    </p>
                    <p className="text-xs text-muted font-mono tabular-nums">
                      {formatCurrency(item.detail.monthSpend)} / {formatCurrency(item.detail.periodBudget)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => updateBudgetItem(item.id, "resolved")}
                      className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover"
                    >
                      已處理
                    </button>
                    <button
                      onClick={() => updateBudgetItem(item.id, "dismissed")}
                      className="text-xs px-2 py-1 rounded border border-card-border text-muted hover:bg-accent-light"
                    >
                      忽略
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
```

> token 核對：`bg-card` / `border-card-border` / `text-foreground` / `text-muted` / `bg-danger/10` / `border-danger/20` / `text-danger` / `bg-accent` / `hover:bg-accent-hover` / `hover:bg-accent-light` 皆為既有 token（見 foundation 第 10 節與 DESIGN.md）。按鈕白字沿用頁面既有 `text-white` 慣例；若 DESIGN.md 有對應 token（如 `text-on-accent`）則以該 token 取代。

- [ ] **Step 3: 加「近期預算變更」卡片**（放在「快速連結」之前）

```tsx
        {budgetChanges.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h2 className="font-display text-base font-semibold text-foreground mb-3">近期預算變更</h2>
            <ul className="space-y-2">
              {budgetChanges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground truncate">
                    <span className="text-xs text-muted mr-2">
                      {c.source === "manual_account_budget" ? "手動" : "平台"}
                    </span>
                    {c.entityLabel}
                  </span>
                  <span className="font-mono tabular-nums text-muted shrink-0">
                    {c.previousValue != null ? formatCurrency(c.previousValue) : "—"} → {formatCurrency(c.newValue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
```

- [ ] **Step 4: 型別檢查 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 無型別錯誤；build 成功（`prisma generate && prisma db push && next build`）。

- [ ] **Step 5: Commit**

```bash
git add src/app/daily/page.tsx
git commit -m "feat(budget): /daily 加預算待辦與近期變更區塊"
```

---

## 收尾（全部 task 完成後）

- [ ] 全測試：`npx vitest run`（既有 282 + 新增 pacing/action-items/snapshot/snapshot-sync/account-budget-log/flex/monitor-jobs/budget-api 測試，應全綠）
- [ ] 型別：`npx tsc --noEmit` 無新錯誤
- [ ] Build：`npm run build` 成功
- [ ] 依 subagent-driven-development 派最終 whole-branch review（最強模型），再走 finishing-a-development-branch

---

## Self-Review（撰寫者自查，對照 spec）

**Spec coverage：**
- spec 一（3 model）→ Task 1 ✅
- spec 二（配速超支檢查，含門檻 1.10/1.25、僅有月預算帳號、去重）→ Task 2（偵測 + 門檻 + 過濾）+ Task 3（去重）✅
- spec 三（快照比對：首見 baseline 不誤報、值變寫 changelog、自動對帳關閉待辦）→ Task 4（純比對，首見不算）+ Task 5（sync + changelog + reconcile）✅；帳號月預算 PATCH diff → Task 6 ✅
- spec 四（呈現：/daily 兩區塊、LINE 摘要加一行、3 API）→ Task 7（LINE）+ Task 9（3 API）+ Task 10（/daily）✅
- spec 五（測試策略 pacing/snapshot-diff/auto-reconcile/account-budget-changelog）→ 對應 Task 2/4/5/6 測試 ✅
- spec 六（決策全採預設）→ 門檻硬編 1.10/1.25（Task 2）、一天一次（Task 8 掛每日摘要）、只記預算數字（未做暫停/開啟）、只做 pacing_overspend ✅
- **spec 四提及「盤中新生成 critical 即時推播」** → 本計畫**未涵蓋**（配速只在每日摘要跑，盤中不生成新 critical，故無盤中即時推播需求）。這與 spec 二/六「配速一天一次、盤中不跑」一致；spec 四那句是選配增強，本期不做 —— 交由執行時與使用者確認是否為缺漏（列為 execution handoff 提醒）。

**Placeholder scan：** 無 TBD/TODO；每個 code step 給完整可執行程式碼。整合類 step（Task 6/7/8 改既有檔）以「既有變數名以實際檔案為準」註記，因無法在計畫中重現未讀取的原檔行；已提供完整插入片段與精確錨點。

**Type consistency：** `PacingViolation`（Task 2 產、3/8 用）、`CampaignBudget`/`SnapshotRecord`/`DetectedChange`（Task 4 產、5 用）、`AccountBudgetChange`（Task 6）、`buildDigestFlex` 第三參數（Task 7 定義、8 傳入）、`syncCampaignSnapshots`/`syncPacingActionItems` 簽章跨 Task 一致。快照 upsert 複合鍵 `userId_scope_entityKey_budgetType` 全 task 一致。

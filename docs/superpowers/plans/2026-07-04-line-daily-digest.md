# LINE 每日摘要推播＋/daily 行動摘要頁＋PWA 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal（目標）**：讓使用者每天早上 08:30（台北時間）在 LINE 收到前一日廣告摘要（花費／ROAS／CPA／本月配速／異常件數），盤中 10/14/18/22 點收到新觸發的異常提醒；並提供 `/daily` 行動摘要頁與 PWA manifest，讓手機可「加到主畫面」直接開啟摘要。

**Architecture（架構）**：

- **資料層**：`UserSettings` 新增 `lineChannelToken`（AES-256-GCM 加密，比照 `windsorApiKey`）、`lineRecipientId`、`linePushEnabled` 三欄位。GET `/api/settings` 只回 `hasLineToken` 布林，絕不回傳 token 值。
- **LINE 層**：`src/lib/line/client.ts`（Messaging API push，失敗回結構化結果不 throw）＋ `src/lib/line/flex.ts`（Flex bubble 組裝＋純文字備援）。
- **摘要層**：`src/lib/digest/build-daily-summary.ts` 純函式，從 `WindsorAdRecord[]` 彙整出昨日與本月摘要，重用既有 `aggregateAccounts` 與 `pacingLevel`。
- **排程層**：`src/lib/cron/monitor-jobs.ts`（逐使用者執行、彼此錯誤隔離）＋ 改寫 `src/lib/cron/scheduler.ts` 掛兩個 node-cron 任務 ＋ 新增 `src/instrumentation.ts` 讓 Next.js 伺服器啟動即初始化排程（不再依賴 sync-notion 路由被打到才啟動）。
- **去重層**：把 `/api/alerts/check` 的每日去重邏輯抽成 `src/lib/alerts/dedupe.ts`，cron 與 API 路由共用；盤中推播只推「本次新寫入」的異常（今日已通知過的規則不再打擾）。
- **UI 層**：設定頁新增 LINE 區塊（含測試推播按鈕）＋ `/daily` 行動摘要頁（單欄、大字、四狀態）＋ `src/app/manifest.ts` PWA manifest 與圖示。
- **middleware 零改動**：`src/middleware.ts` 的 matcher 已排除 `webmanifest`、`png`、`svg`、`ico` 副檔名，manifest 與圖示天生公開，不需修改。

**Tech Stack**：Next.js 16.1.1（App Router、instrumentation hook、`MetadataRoute.Manifest`）、React 19、TypeScript、Tailwind CSS 4（token 制）、Prisma 7、Zod ^3.24、Vitest、node-cron ^4.2.1、sharp（僅 devDependency，產圖示用）。

**Global Constraints（全域約束，每個 Task 都適用）**：

1. **顏色一律用 token**（`bg-accent`、`text-muted`、`bg-info`…），**禁止**硬寫色票（`bg-blue-500`）。唯一例外：LINE Flex JSON 不是網頁 UI、只接受 hex 色票，該 hex 一律收在 `src/lib/line/flex.ts` 的 `COLORS` 常數且值對齊 `src/app/globals.css` 的 token 定義。
2. **UI 必須處理 4 種狀態**：loading、error、empty、success；async 操作時禁用按鈕。
3. **Conventional Commits**（feat/fix/test/chore…），commit 訊息結尾加：
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
4. **程式碼註解使用繁體中文**。
5. **既有 241 個測試不得變紅**：每個 task 完成前跑 `npx vitest run` 確認全綠。
6. **node-cron 一律帶 `{ timezone: "Asia/Taipei" }`** 選項。
7. **LINE Channel Token 加密比照 `windsorApiKey`**：寫入用 `encryptApiKey()`、讀出用 `decryptApiKey()`（`src/lib/utils/crypto.ts`）。
8. **GET `/api/settings` 只回 `hasLineToken` 布林**，任何回應都不得含 token 值（含遮罩值也不回）。
9. LINE 憑證值由使用者自行貼進部署後的設定頁，本計畫全程不經手任何真實憑證。
10. 跑 `npx prisma db push` 前需確認本機 Prisma dev server 在跑（`npm run dev` 會用 concurrently 同時啟動 `prisma dev`；或另開終端跑 `npx prisma dev`）。

**Task 總覽**：

| # | Task | 產出 |
|---|------|------|
| 1 | Prisma schema LINE 欄位＋settings API 擴充 | schema、`/api/settings` GET/PATCH |
| 2 | LINE Messaging API client | `src/lib/line/client.ts`＋測試 |
| 3 | 每日摘要彙整純函式 | `src/lib/digest/build-daily-summary.ts`＋測試 |
| 4 | Flex 訊息組裝＋純文字備援 | `src/lib/line/flex.ts`＋測試 |
| 5 | 異常通知每日去重抽成 lib＋重構 check 路由 | `src/lib/alerts/dedupe.ts`＋測試 |
| 6 | Cron 監控任務＋scheduler 改寫＋instrumentation | `monitor-jobs.ts`、`scheduler.ts`、`src/instrumentation.ts`＋測試 |
| 7 | 測試推播 API | `/api/line/test` |
| 8 | 設定頁 LINE 區塊 | `line-section.tsx`＋`settings/page.tsx` |
| 9 | /daily 行動摘要頁 | `src/app/daily/page.tsx` |
| 10 | PWA manifest＋圖示 | `manifest.ts`、`icon.svg`、`public/icon-*.png` |

---

## Task 1：Prisma schema 加 LINE 三欄位＋settings API 擴充

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/settings/route.ts`
- Test: 無單元測試（glue code）；以 `npx prisma generate`＋`npx prisma db push`＋`npx tsc --noEmit`＋既有 241 測試全綠為驗收

**Interfaces:**

- Produces（DB 欄位）：`UserSettings.lineChannelToken: String?`（加密存放）、`UserSettings.lineRecipientId: String?`、`UserSettings.linePushEnabled: Boolean @default(false)`
- Produces（API）：GET `/api/settings` 回應多一個 `line: { hasLineToken: boolean, recipientId: string | null, enabled: boolean }`；PATCH 接受 `line: { channelToken?: string, recipientId?: string, enabled?: boolean }`
- Consumes：`encryptApiKey`（`src/lib/utils/crypto.ts`）

**Steps:**

- [ ] 1. 修改 `prisma/schema.prisma` 的 `UserSettings` model：在 `accountBudgets Json?` 之後、`createdAt` 之前加三行。改完後該 model 完整長這樣：

```prisma
// ==================== 使用者設定表 ====================
model UserSettings {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  windsorApiKey      String?
  notionApiKey       String?
  notionParentPageId String?
  notionEnabled      Boolean @default(true)
  windsorDateRange   String  @default("last_7d")
  thresholds         Json?
  accountBudgets     Json?
  lineChannelToken   String?
  lineRecipientId    String?
  linePushEnabled    Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

- [ ] 2. 產生 client 並同步 DB（先確認 Prisma dev server 在跑，見 Global Constraints 第 10 條）：

```bash
npx prisma generate
npx prisma db push
```

預期輸出（節錄）：`✔ Generated Prisma Client`、`Your database is now in sync with your Prisma schema.`

- [ ] 3. 修改 `src/app/api/settings/route.ts`。共 4 處：

（a）`SettingsUpdateData` interface（現在檔案第 18–26 行）加三個欄位，改完長這樣：

```typescript
/** 設定更新資料型別 */
interface SettingsUpdateData {
  windsorApiKey?: string | null;
  windsorDateRange?: string;
  notionApiKey?: string | null;
  notionParentPageId?: string | null;
  notionEnabled?: boolean;
  thresholds?: Prisma.InputJsonValue;
  accountBudgets?: Prisma.InputJsonValue;
  lineChannelToken?: string | null;
  lineRecipientId?: string | null;
  linePushEnabled?: boolean;
}
```

（b）`settingsSchema`（`.strict()` 物件）在 `notion` 區塊之後、`thresholds` 之前加 `line`：

```typescript
    line: z
      .object({
        channelToken: z.string().max(500).optional(),
        recipientId: z.string().max(100).optional(),
        enabled: z.boolean().optional(),
      })
      .optional(),
```

（c）GET 的兩個回傳分支都加 `line` 欄位。「無 settings」分支（`if (!settings)` 內）的回傳物件加：

```typescript
        line: { hasLineToken: false, recipientId: null, enabled: false },
```

正常分支（`return NextResponse.json({ windsor: ..., notion: ..., ... })`）在 `notion` 之後加：

```typescript
      // 只回是否已設定的布林，絕不回傳 token 值（含遮罩值）
      line: {
        hasLineToken: !!settings.lineChannelToken,
        recipientId: settings.lineRecipientId,
        enabled: settings.linePushEnabled,
      },
```

（d）PATCH 在「Notion 設定」區塊之後、「閾值設定」之前加（pattern 完全比照 notion）：

```typescript
    // LINE 推播設定（token 加密比照 windsorApiKey；GET 絕不回傳 token 值）
    if (data.line) {
      if (data.line.channelToken !== undefined) {
        updateData.lineChannelToken = data.line.channelToken
          ? encryptApiKey(data.line.channelToken.trim())
          : null;
      }
      if (data.line.recipientId !== undefined) {
        updateData.lineRecipientId = data.line.recipientId?.trim() || null;
      }
      if (data.line.enabled !== undefined) {
        updateData.linePushEnabled = data.line.enabled;
      }
    }
```

- [ ] 4. 驗證：

```bash
npx tsc --noEmit
npx vitest run
```

預期：tsc 無輸出（無錯誤）；vitest `Test Files  22 passed`、`Tests  241 passed`。

- [ ] 5. Commit：

```bash
git add prisma/schema.prisma src/app/api/settings/route.ts
git commit -m "$(cat <<'EOF'
feat(line): UserSettings 加 LINE 憑證欄位，settings API 支援讀寫（token 加密、GET 只回布林）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：LINE Messaging API client

**Files:**

- Create: `src/lib/line/client.ts`
- Test: `src/lib/line/__tests__/client.test.ts`

**Interfaces:**

- Produces:
  - `type LineMessage = LineTextMessage | LineFlexMessage`
  - `interface LinePushResult { ok: boolean; status?: number; error?: string }`
  - `pushLineMessage(channelToken: string, to: string, messages: LineMessage[]): Promise<LinePushResult>`
  - `pushText(channelToken: string, to: string, text: string): Promise<LinePushResult>`
  - `pushFlex(channelToken: string, to: string, bubble: Record<string, unknown>, altText: string): Promise<LinePushResult>`
- Consumes: 全域 `fetch`（Node 18+ 內建）。**任何失敗（非 2xx、網路錯誤）都回 `{ ok: false }`，絕不 throw** —— 這是錯誤處理表「LINE API 4xx/5xx/429 → 記 log 放棄，不得炸掉排程」的基礎。

**Steps:**

- [ ] 1. 先寫失敗測試 `src/lib/line/__tests__/client.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pushLineMessage, pushText, pushFlex } from "../client";

describe("pushLineMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時以正確 URL、Authorization 與 body 呼叫並回傳 ok", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await pushLineMessage("token-123", "U456", [
      { type: "text", text: "哈囉" },
    ]);

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer token-123");
    expect(JSON.parse(init.body)).toEqual({
      to: "U456",
      messages: [{ type: "text", text: "哈囉" }],
    });
  });

  it("4xx 回應時回傳 ok:false 與狀態碼、錯誤內文，不 throw", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"message":"Invalid recipient"}'),
    });

    const result = await pushLineMessage("token", "bad-id", [
      { type: "text", text: "x" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("Invalid recipient");
  });

  it("429 限流回應時回傳 ok:false 且 status 429", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    });

    const result = await pushLineMessage("token", "U1", [
      { type: "text", text: "x" },
    ]);

    expect(result).toEqual({ ok: false, status: 429, error: "rate limited" });
  });

  it("網路錯誤（fetch reject）時回傳 ok:false，不 throw", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await pushLineMessage("token", "U1", [
      { type: "text", text: "x" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});

describe("pushText / pushFlex", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushText 組出 text 訊息", async () => {
    await pushText("token", "U1", "測試文字");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ type: "text", text: "測試文字" }]);
  });

  it("pushFlex 組出 flex 訊息（altText 必填）", async () => {
    const bubble = { type: "bubble", body: { type: "box" } };
    await pushFlex("token", "U1", bubble, "摘要通知");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { type: "flex", altText: "摘要通知", contents: bubble },
    ]);
  });
});
```

- [ ] 2. 跑測試看它失敗（模組不存在）：

```bash
npx vitest run src/lib/line/__tests__/client.test.ts
```

預期：`Failed to load ../client`（或同義的模組解析錯誤）。

- [ ] 3. 最小實作 `src/lib/line/client.ts`：

```typescript
/** LINE 純文字訊息 */
export interface LineTextMessage {
  type: "text";
  text: string;
}

/** LINE Flex 訊息（altText 為通知列預覽文字，不可為空） */
export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

/** 推播結果：一律回傳結構化結果，不 throw */
export interface LinePushResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

/**
 * 推播訊息到 LINE（Messaging API push）
 * 任何失敗（非 2xx、429、網路錯誤）都回 { ok: false }，絕不 throw —
 * 呼叫端（cron 任務）依此決定記 log 放棄，不會炸掉整個排程。
 */
export async function pushLineMessage(
  channelToken: string,
  to: string,
  messages: LineMessage[],
): Promise<LinePushResult> {
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({ to, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 推播純文字訊息（Flex 組裝失敗時的備援通道） */
export function pushText(
  channelToken: string,
  to: string,
  text: string,
): Promise<LinePushResult> {
  return pushLineMessage(channelToken, to, [{ type: "text", text }]);
}

/** 推播 Flex bubble */
export function pushFlex(
  channelToken: string,
  to: string,
  bubble: Record<string, unknown>,
  altText: string,
): Promise<LinePushResult> {
  return pushLineMessage(channelToken, to, [
    { type: "flex", altText, contents: bubble },
  ]);
}
```

- [ ] 4. 跑測試變綠：

```bash
npx vitest run src/lib/line/__tests__/client.test.ts
```

預期：`Tests  6 passed`。

- [ ] 5. 全量驗證＋commit：

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/line/
git commit -m "$(cat <<'EOF'
feat(line): LINE Messaging API client（push 失敗回結構化結果不 throw）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

預期：vitest `Tests  247 passed`（241＋6）。

---

## Task 3：每日摘要彙整純函式

**Files:**

- Create: `src/lib/digest/build-daily-summary.ts`
- Test: `src/lib/digest/__tests__/build-daily-summary.test.ts`

**Interfaces:**

- Consumes:
  - `WindsorAdRecord`（`src/lib/windsor/types.ts`；欄位含 `date`、`account_name`、`spend`、`revenue`、`conversions`、`campaignLifetimeBudget`、`campaignDailyBudget`、`campaignStatus` 等 28 欄）
  - `aggregateAccounts(records: WindsorAdRecord[], days: number, budgetOptions?: AccountBudgetOptions): AccountSummary[]`（`src/lib/initiatives/transform.ts`）
  - `AccountSummary`（`src/lib/initiatives/types.ts`：`{ accountName, platform, spend, periodBudget, hasBudget, progress, budgetSource?, monthlyBudget? }`）
  - `TriggeredAlert`（`src/lib/alerts/types.ts`）
- Produces:
  - `taipeiDateString(d: Date): string`（YYYY-MM-DD，台北時區）
  - `deriveDigestDates(today: Date): DigestDates`
  - `buildDailySummary(records: WindsorAdRecord[], options: DailySummaryOptions): DailySummary`

**設計要點**：一律以「昨日」為基準日；本月 = 昨日所屬月份的 1 號～昨日。既有 `checkRules` 的演算法是「資料內最新一個日期 vs 之前最多 7 個日期的平均」，因此餵 last_60d 資料與 last_14d 結果相同——本模組不需為 alerts 切片資料。

**Steps:**

- [ ] 1. 先寫失敗測試 `src/lib/digest/__tests__/build-daily-summary.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import {
  taipeiDateString,
  deriveDigestDates,
  buildDailySummary,
} from "../build-daily-summary";

/** 產生完整 28 欄位的測試記錄（與 rule-checker 測試同款 helper） */
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2024-01-01",
    source: "meta",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset: "測試廣告組",
    ad_name: "測試廣告",
    spend: 100,
    impressions: 10000,
    clicks: 200,
    conversions: 10,
    revenue: 500,
    frequency: 1.5,
    cpc: 0.5,
    cpm: 10,
    ctr: 2.0,
    roas: 5.0,
    purchases: 10,
    addToCart: 20,
    initiateCheckout: 15,
    leads: 5,
    purchaseValue: 500,
    addToCartValue: 300,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

// 固定「今天」= 台北 2026-07-04 09:00 → 昨日 2026-07-03
const TODAY = new Date("2026-07-04T09:00:00+08:00");

describe("taipeiDateString", () => {
  it("以台北時區輸出 YYYY-MM-DD", () => {
    // UTC 2026-07-03 17:00 = 台北 2026-07-04 01:00
    expect(taipeiDateString(new Date("2026-07-03T17:00:00Z"))).toBe("2026-07-04");
  });
});

describe("deriveDigestDates", () => {
  it("一般日期：昨日、月初、當月第幾天、當月天數", () => {
    expect(deriveDigestDates(TODAY)).toEqual({
      yesterday: "2026-07-03",
      monthStart: "2026-07-01",
      dayOfMonth: 3,
      daysInMonth: 31,
    });
  });

  it("月初邊界：7/1 的昨日是 6/30，月份切回 6 月（30 天）", () => {
    expect(deriveDigestDates(new Date("2026-07-01T08:30:00+08:00"))).toEqual({
      yesterday: "2026-06-30",
      monthStart: "2026-06-01",
      dayOfMonth: 30,
      daysInMonth: 30,
    });
  });
});

describe("buildDailySummary", () => {
  const options = { manualBudgets: {}, today: TODAY, daysInMonth: 31 };

  it("昨日花費只加總昨日記錄", () => {
    const records = [
      makeRecord({ date: "2026-07-03", spend: 100 }),
      makeRecord({ date: "2026-07-03", spend: 50, account_name: "B 帳戶" }),
      makeRecord({ date: "2026-07-02", spend: 999 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.date).toBe("2026-07-03");
    expect(summary.yesterdaySpend).toBe(150);
  });

  it("昨日 ROAS 與 CPA 正確計算", () => {
    const records = [
      makeRecord({ date: "2026-07-03", spend: 100, revenue: 300, conversions: 4 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.yesterdayRoas).toBe(3);
    expect(summary.yesterdayCpa).toBe(25);
  });

  it("除零保護：花費 0 → ROAS null；轉換 0 → CPA null", () => {
    const records = [
      makeRecord({ date: "2026-07-03", spend: 0, revenue: 0, conversions: 0 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.yesterdayRoas).toBeNull();
    expect(summary.yesterdayCpa).toBeNull();
  });

  it("本月花費只計 7/1～7/3，不混入 6 月與今日之後的資料", () => {
    const records = [
      makeRecord({ date: "2026-06-30", spend: 500 }),
      makeRecord({ date: "2026-07-01", spend: 100 }),
      makeRecord({ date: "2026-07-03", spend: 200 }),
      makeRecord({ date: "2026-07-04", spend: 999 }),
    ];

    const summary = buildDailySummary(records, options);
    expect(summary.monthSpend).toBe(300);
  });

  it("無任何預算 → monthBudget 0、monthProgress null", () => {
    const records = [makeRecord({ date: "2026-07-03" })];

    const summary = buildDailySummary(records, options);
    expect(summary.monthBudget).toBe(0);
    expect(summary.monthProgress).toBeNull();
  });

  it("手動月預算 → monthProgress = 有預算帳號花費 ÷ 期間預算", () => {
    // 手動月預算 31000、31 天 → 日預算 1000 → 3 天期間預算 3000
    const records = [
      makeRecord({ date: "2026-07-01", spend: 900 }),
      makeRecord({ date: "2026-07-03", spend: 1800 }),
      makeRecord({ date: "2026-07-03", spend: 50, account_name: "無預算帳戶" }),
    ];

    const summary = buildDailySummary(records, {
      manualBudgets: { 測試帳戶: 31000 },
      today: TODAY,
      daysInMonth: 31,
    });

    expect(summary.monthBudget).toBe(3000);
    // 只計「有預算帳號」的花費 2700，不含無預算帳戶的 50
    expect(summary.monthProgress).toBeCloseTo(0.9);
    expect(summary.accounts.length).toBe(2);
  });

  it("alerts 選項原樣帶出，未給時為空陣列", () => {
    const summary = buildDailySummary([makeRecord({ date: "2026-07-03" })], options);
    expect(summary.alerts).toEqual([]);
  });
});
```

- [ ] 2. 跑測試看它失敗：

```bash
npx vitest run src/lib/digest/__tests__/build-daily-summary.test.ts
```

預期：模組解析錯誤（`../build-daily-summary` 不存在）。

- [ ] 3. 最小實作 `src/lib/digest/build-daily-summary.ts`：

```typescript
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { TriggeredAlert } from "@/lib/alerts/types";
import { aggregateAccounts } from "@/lib/initiatives/transform";
import type { AccountSummary } from "@/lib/initiatives/types";

/** 以台北時區輸出 YYYY-MM-DD（sv locale 天生是 ISO 格式） */
export function taipeiDateString(d: Date): string {
  return d.toLocaleDateString("sv", { timeZone: "Asia/Taipei" });
}

/** 摘要基準日期組（一律以「昨日」為基準；月份取昨日所屬月份） */
export interface DigestDates {
  /** 昨日（台北）YYYY-MM-DD */
  yesterday: string;
  /** 昨日所屬月份的 1 號 YYYY-MM-DD */
  monthStart: string;
  /** 昨日是當月第幾天 */
  dayOfMonth: number;
  /** 昨日所屬月份的天數 */
  daysInMonth: number;
}

/** 從「今天」推導摘要的各基準日期 */
export function deriveDigestDates(today: Date): DigestDates {
  const todayStr = taipeiDateString(today);
  // 先落到台北當日 00:00，再減一天取得昨日
  const todayTaipei = new Date(`${todayStr}T00:00:00+08:00`);
  const yesterdayDate = new Date(todayTaipei.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = taipeiDateString(yesterdayDate);

  const [year, month, day] = yesterday.split("-").map(Number);
  return {
    yesterday,
    monthStart: `${yesterday.slice(0, 7)}-01`,
    dayOfMonth: day,
    // new Date(y, m, 0) = 該月最後一天（m 為 1-based 月份）
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

/** buildDailySummary 選項 */
export interface DailySummaryOptions {
  /** 帳號名稱 → 手動月預算（原幣別） */
  manualBudgets: Record<string, number>;
  /** 「今天」（測試可注入固定時間） */
  today: Date;
  /** 昨日所屬月份天數（呼叫端以 deriveDigestDates 取得） */
  daysInMonth: number;
  /** 已觸發的異常（可選，摘要僅呈現件數與內容） */
  alerts?: TriggeredAlert[];
}

/** 每日摘要結果 */
export interface DailySummary {
  /** 基準日（昨日）YYYY-MM-DD */
  date: string;
  /** 昨日全帳號花費 */
  yesterdaySpend: number;
  /** 昨日 ROAS（花費為 0 → null） */
  yesterdayRoas: number | null;
  /** 昨日 CPA（轉換為 0 → null） */
  yesterdayCpa: number | null;
  /** 本月（1 號～昨日）全帳號花費 */
  monthSpend: number;
  /** 有設定預算帳號的期間預算加總 */
  monthBudget: number;
  /** 有預算帳號花費 ÷ monthBudget；無任何預算 → null */
  monthProgress: number | null;
  /** 帳號層級配速明細（依花費由高到低） */
  accounts: AccountSummary[];
  /** 異常清單（options.alerts 原樣帶出） */
  alerts: TriggeredAlert[];
}

/** 加總指定數值欄位 */
function sum(
  records: WindsorAdRecord[],
  field: "spend" | "revenue" | "conversions",
): number {
  return records.reduce((total, r) => total + (r[field] || 0), 0);
}

/**
 * 從 Windsor 記錄彙整每日摘要（純函式）
 * 基準日一律是「昨日」；本月 = 昨日所屬月份 1 號～昨日。
 */
export function buildDailySummary(
  records: WindsorAdRecord[],
  options: DailySummaryOptions,
): DailySummary {
  const dates = deriveDigestDates(options.today);

  // 昨日指標
  const yesterdayRecords = records.filter((r) => r.date === dates.yesterday);
  const yesterdaySpend = sum(yesterdayRecords, "spend");
  const yesterdayRevenue = sum(yesterdayRecords, "revenue");
  const yesterdayConversions = sum(yesterdayRecords, "conversions");
  const yesterdayRoas =
    yesterdaySpend > 0 ? yesterdayRevenue / yesterdaySpend : null;
  const yesterdayCpa =
    yesterdayConversions > 0 ? yesterdaySpend / yesterdayConversions : null;

  // 本月（字串比較對 YYYY-MM-DD 成立）
  const monthRecords = records.filter(
    (r) => r.date >= dates.monthStart && r.date <= dates.yesterday,
  );
  const monthSpend = sum(monthRecords, "spend");

  // 帳號配速：重用 /initiatives 的彙整（含手動月預算換算）
  const accounts = aggregateAccounts(monthRecords, dates.dayOfMonth, {
    manualBudgets: options.manualBudgets,
    daysInMonth: options.daysInMonth,
  });

  const budgeted = accounts.filter((a) => a.hasBudget);
  const monthBudget = budgeted.reduce((total, a) => total + a.periodBudget, 0);
  const budgetedSpend = budgeted.reduce((total, a) => total + a.spend, 0);
  const monthProgress = monthBudget > 0 ? budgetedSpend / monthBudget : null;

  return {
    date: dates.yesterday,
    yesterdaySpend,
    yesterdayRoas,
    yesterdayCpa,
    monthSpend,
    monthBudget,
    monthProgress,
    accounts,
    alerts: options.alerts ?? [],
  };
}
```

- [ ] 4. 跑測試變綠：

```bash
npx vitest run src/lib/digest/__tests__/build-daily-summary.test.ts
```

預期：`Tests  10 passed`。

- [ ] 5. 全量驗證＋commit：

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/digest/
git commit -m "$(cat <<'EOF'
feat(digest): 每日摘要彙整純函式（昨日指標＋本月配速，重用 aggregateAccounts）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

預期：vitest `Tests  257 passed`（247＋10）。

---

## Task 4：Flex 訊息組裝＋純文字備援

**Files:**

- Create: `src/lib/line/flex.ts`
- Test: `src/lib/line/__tests__/flex.test.ts`

**Interfaces:**

- Consumes:
  - `DailySummary`（Task 3 的 `src/lib/digest/build-daily-summary.ts`）
  - `TriggeredAlert`（`src/lib/alerts/types.ts`：`{ ruleId, ruleName, title, message, metric, currentValue, previousValue, changePercent, severity: "critical" | "warning" | "info" }`）
  - `pacingLevel(progress: number): "good" | "warn" | "bad"`（`src/lib/initiatives/pacing.ts`；good 85%~110%、warn 70~85% 與 110~120%、bad 其餘——**與 /initiatives 頁一致**）
  - `formatCurrency`、`formatRoas`（`src/lib/utils/format.ts`）
- Produces:
  - `COLORS`（hex 常數，值對齊 `globals.css` token）、`pacingHex(progress: number): string`、`SEVERITY_HEX`、`safeText(value: string): string`、`MAX_ALERT_ROWS = 5`
  - `buildDigestFlex(summary: DailySummary, appUrl: string): Record<string, unknown>`
  - `buildAlertFlex(alerts: TriggeredAlert[], appUrl: string): Record<string, unknown>`
  - `buildTestFlex(appUrl: string): Record<string, unknown>`
  - `buildDigestText(summary: DailySummary, appUrl: string): string`（純文字備援）
  - `buildAlertText(alerts: TriggeredAlert[], appUrl: string): string`（純文字備援）

**LINE Flex 硬限制（實作時逐字遵守）**：Flex JSON 只接受 hex 色票（Global Constraints 第 1 條的唯一例外）；text 節點的 `text` 不允許空字串——所有動態字串都過 `safeText()`（空字串墊「—」）。

**Steps:**

- [ ] 1. 先寫失敗測試 `src/lib/line/__tests__/flex.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import type { DailySummary } from "@/lib/digest/build-daily-summary";
import type { TriggeredAlert } from "@/lib/alerts/types";
import {
  COLORS,
  pacingHex,
  safeText,
  MAX_ALERT_ROWS,
  buildDigestFlex,
  buildAlertFlex,
  buildTestFlex,
  buildDigestText,
  buildAlertText,
} from "../flex";

const APP_URL = "https://example.com";

/** 產生測試用摘要 */
function makeSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: "2026-07-03",
    yesterdaySpend: 12345,
    yesterdayRoas: 3.21,
    yesterdayCpa: 250,
    monthSpend: 90000,
    monthBudget: 100000,
    monthProgress: 0.9,
    accounts: [],
    alerts: [],
    ...overrides,
  };
}

/** 產生測試用異常 */
function makeAlert(overrides: Partial<TriggeredAlert> = {}): TriggeredAlert {
  return {
    ruleId: "rule-1",
    ruleName: "測試規則",
    title: "花費異常",
    message: "花費 200 超過閾值 100",
    metric: "spend",
    currentValue: 200,
    previousValue: 100,
    changePercent: 100,
    severity: "warning",
    ...overrides,
  };
}

/** 遞迴收集 bubble 內所有 text 節點的文字 */
function collectTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTexts(n, out));
    return out;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") {
      out.push(obj.text);
    }
    Object.values(obj).forEach((v) => collectTexts(v, out));
  }
  return out;
}

describe("safeText / pacingHex", () => {
  it("空字串與純空白墊為「—」", () => {
    expect(safeText("")).toBe("—");
    expect(safeText("   ")).toBe("—");
    expect(safeText("正常")).toBe("正常");
  });

  it("配速色與 pacingLevel 一致：1.0→綠、1.15→黃、1.5→紅", () => {
    expect(pacingHex(1.0)).toBe(COLORS.success);
    expect(pacingHex(1.15)).toBe(COLORS.warning);
    expect(pacingHex(1.5)).toBe(COLORS.danger);
  });
});

describe("buildDigestFlex", () => {
  it("是 bubble，footer 按鈕連到 /daily", () => {
    const bubble = buildDigestFlex(makeSummary(), APP_URL) as {
      type: string;
      footer: { contents: Array<{ action: { uri: string } }> };
    };

    expect(bubble.type).toBe("bubble");
    expect(bubble.footer.contents[0].action.uri).toBe(
      "https://example.com/daily",
    );
  });

  it("所有 text 節點都不是空字串（LINE 硬限制）", () => {
    const texts = collectTexts(buildDigestFlex(makeSummary(), APP_URL));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("ROAS / CPA 為 null 時顯示「—」；無預算顯示「未設定預算」", () => {
    const bubble = buildDigestFlex(
      makeSummary({
        yesterdayRoas: null,
        yesterdayCpa: null,
        monthProgress: null,
        monthBudget: 0,
      }),
      APP_URL,
    );
    const texts = collectTexts(bubble);

    expect(texts).toContain("—");
    expect(texts).toContain("未設定預算");
  });

  it("有異常時顯示件數", () => {
    const bubble = buildDigestFlex(
      makeSummary({ alerts: [makeAlert(), makeAlert({ ruleId: "rule-2" })] }),
      APP_URL,
    );
    const texts = collectTexts(bubble);

    expect(texts.some((t) => t.includes("2 件"))).toBe(true);
  });
});

describe("buildAlertFlex", () => {
  it("超過上限只列 5 件並附「其餘 N 件」", () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ ruleId: `rule-${i}`, title: `異常 ${i}` }),
    );
    const texts = collectTexts(buildAlertFlex(alerts, APP_URL));

    expect(MAX_ALERT_ROWS).toBe(5);
    expect(texts.filter((t) => t.startsWith("異常 ")).length).toBe(5);
    expect(texts.some((t) => t.includes("其餘 2 件"))).toBe(true);
  });

  it("依 severity 排序，header 色為最高嚴重度", () => {
    const alerts = [
      makeAlert({ severity: "info", title: "資訊" }),
      makeAlert({ ruleId: "rule-2", severity: "critical", title: "嚴重" }),
    ];
    const bubble = buildAlertFlex(alerts, APP_URL) as {
      header: { backgroundColor: string };
    };
    const texts = collectTexts(bubble);

    expect(bubble.header.backgroundColor).toBe(COLORS.danger);
    // critical 排在 info 前面
    expect(texts.indexOf("嚴重")).toBeLessThan(texts.indexOf("資訊"));
  });

  it("footer 按鈕連到 /alerts，所有 text 非空", () => {
    const bubble = buildAlertFlex([makeAlert()], APP_URL) as {
      footer: { contents: Array<{ action: { uri: string } }> };
    };

    expect(bubble.footer.contents[0].action.uri).toBe(
      "https://example.com/alerts",
    );
    for (const t of collectTexts(bubble)) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("buildTestFlex / 純文字備援", () => {
  it("buildTestFlex 是 bubble 且 text 非空", () => {
    const bubble = buildTestFlex(APP_URL) as { type: string };
    expect(bubble.type).toBe("bubble");
    for (const t of collectTexts(bubble)) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("buildDigestText 含基準日與連結", () => {
    const text = buildDigestText(makeSummary(), APP_URL);
    expect(text).toContain("2026-07-03");
    expect(text).toContain("https://example.com/daily");
  });

  it("buildAlertText 含件數與連結", () => {
    const text = buildAlertText([makeAlert()], APP_URL);
    expect(text).toContain("1 件");
    expect(text).toContain("https://example.com/alerts");
  });
});
```

- [ ] 2. 跑測試看它失敗：

```bash
npx vitest run src/lib/line/__tests__/flex.test.ts
```

預期：模組解析錯誤（`../flex` 不存在）。

- [ ] 3. 最小實作 `src/lib/line/flex.ts`：

```typescript
import type { DailySummary } from "@/lib/digest/build-daily-summary";
import type { TriggeredAlert } from "@/lib/alerts/types";
import { pacingLevel, type PacingLevel } from "@/lib/initiatives/pacing";
import { formatCurrency, formatRoas } from "@/lib/utils/format";

/**
 * LINE Flex JSON 只接受 hex 色票，無法使用 CSS token —
 * 這是全案唯一允許硬寫色票的地方，值一律對齊 src/app/globals.css 的 token 定義。
 */
export const COLORS = {
  accent: "#4f46e5",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  muted: "#64748b",
  foreground: "#0f172a",
  track: "#e2e8f0",
  background: "#f1f5f9",
} as const;

/** 配速等級 → hex（等級判定重用 /initiatives 的 pacingLevel） */
const PACING_HEX: Record<PacingLevel, string> = {
  good: COLORS.success,
  warn: COLORS.warning,
  bad: COLORS.danger,
};

/** 依配速比例取 hex 色 */
export function pacingHex(progress: number): string {
  return PACING_HEX[pacingLevel(progress)];
}

/** 嚴重度 → hex */
export const SEVERITY_HEX: Record<TriggeredAlert["severity"], string> = {
  critical: COLORS.danger,
  warning: COLORS.warning,
  info: COLORS.info,
};

/** 嚴重度排序權重（越小越前面） */
const SEVERITY_ORDER: Record<TriggeredAlert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** 異常訊息最多列出的件數 */
export const MAX_ALERT_ROWS = 5;

/** LINE Flex text 不允許空字串：空值一律墊「—」 */
export function safeText(value: string): string {
  return value.trim() === "" ? "—" : value;
}

/** Flex 節點通用型別 */
type FlexNode = Record<string, unknown>;

/** 標籤＋數值的橫向列 */
function kvRow(
  label: string,
  value: string,
  valueColor: string = COLORS.foreground,
): FlexNode {
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      {
        type: "text",
        text: safeText(label),
        size: "sm",
        color: COLORS.muted,
        flex: 4,
      },
      {
        type: "text",
        text: safeText(value),
        size: "sm",
        color: valueColor,
        align: "end",
        weight: "bold",
        flex: 5,
      },
    ],
  };
}

/** 靛色 header */
function header(title: string, subtitle: string, bgColor: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: bgColor,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: safeText(title),
        color: "#ffffff",
        weight: "bold",
        size: "md",
      },
      {
        type: "text",
        text: safeText(subtitle),
        color: "#ffffff",
        size: "xs",
        margin: "xs",
      },
    ],
  };
}

/** 開啟連結的 footer 按鈕 */
function footerButton(label: string, uri: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: [
      {
        type: "button",
        style: "primary",
        color: COLORS.accent,
        height: "sm",
        action: { type: "uri", label, uri },
      },
    ],
  };
}

/** 每日摘要 Flex bubble */
export function buildDigestFlex(
  summary: DailySummary,
  appUrl: string,
): Record<string, unknown> {
  const bodyContents: FlexNode[] = [
    { type: "text", text: "昨日花費", size: "xs", color: COLORS.muted },
    {
      type: "text",
      text: safeText(formatCurrency(summary.yesterdaySpend)),
      size: "xxl",
      weight: "bold",
      color: COLORS.foreground,
      margin: "xs",
    },
    { type: "separator", margin: "lg" },
  ];

  // 本月配速：有預算畫進度條，無預算顯示「未設定預算」
  if (summary.monthProgress !== null) {
    const pct = Math.round(summary.monthProgress * 100);
    // 進度條寬度 1%～100%（LINE 不接受 0%）
    const barWidth = Math.max(1, Math.min(pct, 100));
    const color = pacingHex(summary.monthProgress);

    bodyContents.push(
      kvRow("本月配速", `${pct}%`, color),
      {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.track,
        cornerRadius: "sm",
        height: "8px",
        margin: "sm",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: color,
            cornerRadius: "sm",
            height: "8px",
            width: `${barWidth}%`,
            contents: [{ type: "filler" }],
          },
        ],
      },
      kvRow(
        "本月花費 / 預算",
        `${formatCurrency(summary.monthSpend)} / ${formatCurrency(summary.monthBudget)}`,
      ),
    );
  } else {
    bodyContents.push(kvRow("本月配速", "未設定預算", COLORS.muted));
    bodyContents.push(kvRow("本月花費", formatCurrency(summary.monthSpend)));
  }

  bodyContents.push(
    { type: "separator", margin: "lg" },
    kvRow(
      "昨日 ROAS",
      summary.yesterdayRoas !== null ? formatRoas(summary.yesterdayRoas) : "—",
    ),
    kvRow(
      "昨日 CPA",
      summary.yesterdayCpa !== null
        ? formatCurrency(summary.yesterdayCpa)
        : "—",
    ),
    kvRow(
      "異常",
      summary.alerts.length > 0 ? `${summary.alerts.length} 件` : "無",
      summary.alerts.length > 0 ? COLORS.danger : COLORS.success,
    ),
  );

  return {
    type: "bubble",
    header: header("每日廣告摘要", `基準日 ${summary.date}`, COLORS.accent),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents,
    },
    footer: footerButton("查看完整摘要", `${appUrl}/daily`),
  };
}

/** 異常提醒 Flex bubble（最多 MAX_ALERT_ROWS 件，依嚴重度排序） */
export function buildAlertFlex(
  alerts: TriggeredAlert[],
  appUrl: string,
): Record<string, unknown> {
  const sorted = [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const shown = sorted.slice(0, MAX_ALERT_ROWS);
  const rest = sorted.length - shown.length;
  const headerColor = SEVERITY_HEX[sorted[0]?.severity ?? "info"];

  const bodyContents: FlexNode[] = shown.map((alert) => ({
    type: "box",
    layout: "vertical",
    margin: "md",
    contents: [
      {
        type: "text",
        text: safeText(alert.title),
        size: "sm",
        weight: "bold",
        color: SEVERITY_HEX[alert.severity],
        wrap: true,
      },
      {
        type: "text",
        text: safeText(alert.message),
        size: "xs",
        color: COLORS.muted,
        wrap: true,
        margin: "xs",
      },
    ],
  }));

  if (rest > 0) {
    bodyContents.push({
      type: "text",
      text: `…其餘 ${rest} 件`,
      size: "xs",
      color: COLORS.muted,
      margin: "md",
    });
  }

  return {
    type: "bubble",
    header: header("廣告異常提醒", `共 ${alerts.length} 件`, headerColor),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents,
    },
    footer: footerButton("查看異常規則", `${appUrl}/alerts`),
  };
}

/** 測試推播用 bubble（設定頁「發送測試訊息」） */
export function buildTestFlex(appUrl: string): Record<string, unknown> {
  return {
    type: "bubble",
    header: header("測試訊息", "Ad Manager Pro", COLORS.accent),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: "LINE 推播設定成功！之後每天早上 08:30 會收到前一日廣告摘要。",
          size: "sm",
          color: COLORS.foreground,
          wrap: true,
        },
      ],
    },
    footer: footerButton("開啟每日摘要", `${appUrl}/daily`),
  };
}

/** 每日摘要純文字備援（Flex 組裝失敗時使用） */
export function buildDigestText(summary: DailySummary, appUrl: string): string {
  const roas =
    summary.yesterdayRoas !== null ? formatRoas(summary.yesterdayRoas) : "—";
  const cpa =
    summary.yesterdayCpa !== null
      ? formatCurrency(summary.yesterdayCpa)
      : "—";
  const pace =
    summary.monthProgress !== null
      ? `${Math.round(summary.monthProgress * 100)}%`
      : "未設定預算";

  return [
    `每日廣告摘要（${summary.date}）`,
    `昨日花費：${formatCurrency(summary.yesterdaySpend)}`,
    `昨日 ROAS：${roas}｜CPA：${cpa}`,
    `本月配速：${pace}`,
    `異常：${summary.alerts.length > 0 ? `${summary.alerts.length} 件` : "無"}`,
    `${appUrl}/daily`,
  ].join("\n");
}

/** 異常提醒純文字備援 */
export function buildAlertText(
  alerts: TriggeredAlert[],
  appUrl: string,
): string {
  const lines = alerts
    .slice(0, MAX_ALERT_ROWS)
    .map((a) => `・${a.title}：${a.message}`);
  const rest = alerts.length - Math.min(alerts.length, MAX_ALERT_ROWS);
  if (rest > 0) lines.push(`…其餘 ${rest} 件`);

  return [
    `廣告異常提醒（${alerts.length} 件）`,
    ...lines,
    `${appUrl}/alerts`,
  ].join("\n");
}
```

- [ ] 4. 跑測試變綠：

```bash
npx vitest run src/lib/line/__tests__/flex.test.ts
```

預期：`Tests  11 passed`。

- [ ] 5. 全量驗證＋commit：

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/line/
git commit -m "$(cat <<'EOF'
feat(line): Flex 摘要/異常/測試訊息組裝＋純文字備援（hex 對齊 token、safeText 防空字串）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

預期：vitest `Tests  268 passed`（257＋11）。

---

## Task 5：異常通知每日去重抽成 lib＋重構 check 路由

**Files:**

- Create: `src/lib/alerts/dedupe.ts`
- Modify: `src/app/api/alerts/check/route.ts`
- Test: `src/lib/alerts/__tests__/dedupe.test.ts`

**Interfaces:**

- Consumes: `prisma`（`@/lib/db/prisma`）、`TriggeredAlert`（`@/lib/alerts/types`）、`AlertNotification`（`@prisma/client`）
- Produces:
  - `taipeiStartOfDay(now?: Date): Date`
  - `saveNewAlertNotifications(userId: string, triggeredAlerts: TriggeredAlert[], now?: Date): Promise<{ newAlerts: TriggeredAlert[]; notifications: AlertNotification[] }>`
- 行為不變約束：重構後 `/api/alerts/check` 的回應格式維持 `{ triggered: <寫入的 AlertNotification 陣列>, checkedRules: <規則數> }`，去重語意（同一規則台北當日只寫一次）完全不變。

**Steps:**

- [ ] 1. 先寫失敗測試 `src/lib/alerts/__tests__/dedupe.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TriggeredAlert } from "@/lib/alerts/types";

// mock prisma（測試不打真 DB）
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alertNotification: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { taipeiStartOfDay, saveNewAlertNotifications } from "../dedupe";

const findManyMock = vi.mocked(prisma.alertNotification.findMany);
const createMock = vi.mocked(prisma.alertNotification.create);

/** 產生測試用 TriggeredAlert */
function makeAlert(overrides: Partial<TriggeredAlert> = {}): TriggeredAlert {
  return {
    ruleId: "rule-1",
    ruleName: "測試規則",
    title: "花費異常",
    message: "花費 200 超過閾值 100",
    metric: "spend",
    currentValue: 200,
    previousValue: 100,
    changePercent: 100,
    severity: "warning",
    ...overrides,
  };
}

describe("taipeiStartOfDay", () => {
  it("UTC 深夜換日邊界：台北 07-04 01:00 的當日起點是 07-03T16:00Z", () => {
    // UTC 2026-07-03 17:00 = 台北 2026-07-04 01:00
    const start = taipeiStartOfDay(new Date("2026-07-03T17:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });
});

describe("saveNewAlertNotifications", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    createMock.mockReset();
  });

  it("空觸發清單：不打 DB，回空結果", async () => {
    const result = await saveNewAlertNotifications("user-1", []);

    expect(result).toEqual({ newAlerts: [], notifications: [] });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("今日已有同規則通知 → 過濾不重寫", async () => {
    findManyMock.mockResolvedValue([{ ruleId: "rule-1" }] as never);

    const result = await saveNewAlertNotifications("user-1", [makeAlert()]);

    expect(result.newAlerts).toEqual([]);
    expect(result.notifications).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("新規則 → 寫入且 create data 欄位正確（含 read: false）", async () => {
    findManyMock.mockResolvedValue([] as never);
    const created = { id: "n-1", ruleId: "rule-1" };
    createMock.mockResolvedValue(created as never);

    const alert = makeAlert();
    const now = new Date("2026-07-04T09:00:00+08:00");
    const result = await saveNewAlertNotifications("user-1", [alert], now);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        ruleId: "rule-1",
        userId: "user-1",
        title: "花費異常",
        message: "花費 200 超過閾值 100",
        metric: "spend",
        currentValue: 200,
        previousValue: 100,
        changePercent: 100,
        severity: "warning",
        read: false,
      },
    });
    expect(result.newAlerts).toEqual([alert]);
    expect(result.notifications).toEqual([created]);

    // 去重查詢以台北當日 00:00 為界
    const where = findManyMock.mock.calls[0][0]?.where as {
      createdAt: { gte: Date };
    };
    expect(where.createdAt.gte.toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });

  it("混合情境：兩新一舊 → 只寫兩筆新的", async () => {
    findManyMock.mockResolvedValue([{ ruleId: "rule-old" }] as never);
    createMock.mockResolvedValue({ id: "n-x" } as never);

    const alerts = [
      makeAlert({ ruleId: "rule-old" }),
      makeAlert({ ruleId: "rule-a" }),
      makeAlert({ ruleId: "rule-b" }),
    ];
    const result = await saveNewAlertNotifications("user-1", alerts);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.newAlerts.map((a) => a.ruleId)).toEqual(["rule-a", "rule-b"]);
  });
});
```

- [ ] 2. 跑測試看它失敗：

```bash
npx vitest run src/lib/alerts/__tests__/dedupe.test.ts
```

預期：模組解析錯誤（`../dedupe` 不存在）。

- [ ] 3. 最小實作 `src/lib/alerts/dedupe.ts`（邏輯照抄現行 `/api/alerts/check` 的去重塊）：

```typescript
import { prisma } from "@/lib/db/prisma";
import type { AlertNotification } from "@prisma/client";
import type { TriggeredAlert } from "@/lib/alerts/types";

/** 以台北時區取得「當天 00:00」的時間點 */
export function taipeiStartOfDay(now: Date = new Date()): Date {
  const today = now.toLocaleDateString("sv", { timeZone: "Asia/Taipei" });
  return new Date(`${today}T00:00:00+08:00`);
}

/** 去重寫入結果 */
export interface SaveNotificationsResult {
  /** 本次「新寫入」對應的觸發（今日已通知過的規則不在內） */
  newAlerts: TriggeredAlert[];
  /** 本次新寫入的通知記錄 */
  notifications: AlertNotification[];
}

/**
 * 儲存新觸發的通知（每日去重：同一規則台北當日只寫入一次）
 * API 路由與 cron 任務共用；cron 依 newAlerts 是否為空決定要不要推播。
 */
export async function saveNewAlertNotifications(
  userId: string,
  triggeredAlerts: TriggeredAlert[],
  now: Date = new Date(),
): Promise<SaveNotificationsResult> {
  if (triggeredAlerts.length === 0) {
    return { newAlerts: [], notifications: [] };
  }

  const startOfDay = taipeiStartOfDay(now);
  const ruleIds = triggeredAlerts.map((a) => a.ruleId);

  // 批次查詢今日已存在的通知，避免 N+1 問題
  const existingToday = await prisma.alertNotification.findMany({
    where: {
      ruleId: { in: ruleIds },
      userId,
      createdAt: { gte: startOfDay },
    },
    select: { ruleId: true },
  });
  const existingRuleIds = new Set(
    existingToday.map((n: { ruleId: string }) => n.ruleId),
  );

  const newAlerts: TriggeredAlert[] = [];
  const notifications: AlertNotification[] = [];

  for (const alert of triggeredAlerts) {
    if (existingRuleIds.has(alert.ruleId)) continue;

    const notification = await prisma.alertNotification.create({
      data: {
        ruleId: alert.ruleId,
        userId,
        title: alert.title,
        message: alert.message,
        metric: alert.metric,
        currentValue: alert.currentValue,
        previousValue: alert.previousValue,
        changePercent: alert.changePercent,
        severity: alert.severity,
        read: false,
      },
    });
    newAlerts.push(alert);
    notifications.push(notification);
  }

  return { newAlerts, notifications };
}
```

- [ ] 4. 跑測試變綠：

```bash
npx vitest run src/lib/alerts/__tests__/dedupe.test.ts
```

預期：`Tests  5 passed`。

- [ ] 5. 重構 `src/app/api/alerts/check/route.ts` 改用共用函式（行為不變）。整檔改寫為：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireWindsorApiKey } from "@/lib/auth/require-windsor-key";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";

/**
 * POST /api/alerts/check
 * 執行規則檢查，並儲存觸發的通知（每日去重）
 */
export async function POST(req: NextRequest) {
  const gate = await requireWindsorApiKey(req, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (gate instanceof NextResponse) return gate;
  const { user, apiKey } = gate;

  try {
    // 取得使用者啟用的警報規則
    const rules = await prisma.alertRule.findMany({
      where: { userId: user.id, enabled: true },
    });

    if (rules.length === 0) {
      return NextResponse.json({ triggered: [], checkedRules: 0 });
    }

    // 抓取過去 14 天的 Windsor 資料
    const query = buildAdPerformanceQuery("all", "last_14d");
    const { data } = await fetchWindsor(apiKey, query);

    // 執行規則檢查
    const triggeredAlerts = checkRules(rules, data);

    // 每日去重寫入（與 LINE 盤中異常任務共用同一套邏輯）
    const { notifications } = await saveNewAlertNotifications(
      user.id,
      triggeredAlerts,
    );

    return NextResponse.json({
      triggered: notifications,
      checkedRules: rules.length,
    });
  } catch (error) {
    console.error("規則檢查失敗:", error);
    return NextResponse.json(
      {
        error: "規則檢查失敗",
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

- [ ] 6. 全量驗證＋commit：

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/alerts/ src/app/api/alerts/check/route.ts
git commit -m "$(cat <<'EOF'
refactor(alerts): 每日去重寫入抽成 saveNewAlertNotifications，check 路由改共用（行為不變）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

預期：vitest `Tests  273 passed`（268＋5）。

---

## Task 6：Cron 監控任務＋scheduler 改寫＋instrumentation

**Files:**

- Create: `src/lib/cron/monitor-jobs.ts`
- Create: `src/instrumentation.ts`
- Modify: `src/lib/cron/scheduler.ts`
- Test: `src/lib/cron/__tests__/monitor-jobs.test.ts`

**Interfaces:**

- Consumes:
  - `prisma.userSettings.findMany`、`prisma.alertRule.findMany`
  - `decryptApiKey`（`@/lib/utils/crypto`；dev 未設 `ENCRYPTION_KEY` 時回原文，production 缺 key 會 throw——所以解密要包 try/catch）
  - `fetchWindsor(apiKey, params)`（`@/lib/windsor/client`）
  - `buildInitiativeQuery("all", "last_60d")`（每日摘要要預算欄位，**必須用 initiative 查詢**；`buildAdPerformanceQuery` 的欄位組沒有預算欄位）
  - `buildAdPerformanceQuery("all", "last_14d")`（盤中異常檢查，與既有 `/api/alerts/check` 完全一致）
  - `checkRules(rules, data)`（`@/lib/alerts/rule-checker`；prisma AlertRule row 與其 `RuleRow` 參數結構相容，可直接傳）
  - `saveNewAlertNotifications`（Task 5）、`buildDailySummary`／`deriveDigestDates`（Task 3）、`pushFlex`／`pushText`（Task 2）、`buildDigestFlex`／`buildAlertFlex`／`buildDigestText`／`buildAlertText`（Task 4）
  - `mergeAccountBudgets(existing: unknown, patch)`（`@/lib/settings/account-budgets`；用 `mergeAccountBudgets(settings.accountBudgets, {})` 把 DB 的 JSON 淨化成 `Record<string, number>`）
- Produces:
  - `getAppUrl(): string`（`NEXT_PUBLIC_APP_URL`，預設 `http://localhost:3000`）
  - `runDailyDigestForAllUsers(now?: Date): Promise<void>`
  - `runAnomalyCheckForAllUsers(now?: Date): Promise<void>`

**錯誤處理（spec 錯誤處理表在本 task 的落實）**：

| 情境 | 行為 |
|------|------|
| 使用者缺 LINE token / recipientId / Windsor key | log 後跳過該使用者 |
| `ENCRYPTION_KEY` 錯誤導致解密 throw | try/catch，log 後跳過該使用者 |
| Windsor 抓取失敗 | try/catch，log 後跳過該使用者（不影響其他使用者） |
| Flex 組裝異常 | try/catch，退純文字備援再推 |
| LINE API 4xx/5xx/429（`result.ok === false`） | 記 log 放棄，不重試、不 throw |
| 單一使用者任何未預期錯誤 | 外層 try/catch 隔離，繼續處理下一位 |
| 盤中檢查無「新寫入」異常 | 不推播（今日已通知過的規則不打擾） |

**Steps:**

- [ ] 1. 先寫失敗測試 `src/lib/cron/__tests__/monitor-jobs.test.ts`（mock prisma / windsor client / line client / dedupe；`crypto` 用真實實作——測試環境未設 `ENCRYPTION_KEY`，`decryptApiKey` 直接回原文；`checkRules`、`buildDailySummary`、flex 組裝用真實實作）：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserSettings } from "@prisma/client";
import type { WindsorAdRecord } from "@/lib/windsor/types";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userSettings: { findMany: vi.fn() },
    alertRule: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/windsor/client", () => ({
  fetchWindsor: vi.fn(),
}));
vi.mock("@/lib/line/client", () => ({
  pushFlex: vi.fn(),
  pushText: vi.fn(),
}));
vi.mock("@/lib/alerts/dedupe", () => ({
  saveNewAlertNotifications: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { fetchWindsor } from "@/lib/windsor/client";
import { pushFlex, pushText } from "@/lib/line/client";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";
import {
  getAppUrl,
  runDailyDigestForAllUsers,
  runAnomalyCheckForAllUsers,
} from "../monitor-jobs";

const settingsFindMany = vi.mocked(prisma.userSettings.findMany);
const ruleFindMany = vi.mocked(prisma.alertRule.findMany);
const fetchWindsorMock = vi.mocked(fetchWindsor);
const pushFlexMock = vi.mocked(pushFlex);
const pushTextMock = vi.mocked(pushText);
const saveMock = vi.mocked(saveNewAlertNotifications);

/** 產生完整 UserSettings 測試列 */
function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: "settings-1",
    userId: "user-1",
    windsorApiKey: "windsor-key",
    notionApiKey: null,
    notionParentPageId: null,
    notionEnabled: true,
    windsorDateRange: "last_7d",
    thresholds: null,
    accountBudgets: null,
    lineChannelToken: "line-token",
    lineRecipientId: "U123",
    linePushEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** 產生完整 28 欄位的 Windsor 測試記錄 */
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2026-07-03",
    source: "meta",
    account_name: "測試帳戶",
    campaign: "測試活動",
    adset: "測試廣告組",
    ad_name: "測試廣告",
    spend: 100,
    impressions: 10000,
    clicks: 200,
    conversions: 10,
    revenue: 500,
    frequency: 1.5,
    cpc: 0.5,
    cpm: 10,
    ctr: 2.0,
    roas: 5.0,
    purchases: 10,
    addToCart: 20,
    initiateCheckout: 15,
    leads: 5,
    purchaseValue: 500,
    addToCartValue: 300,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    campaignLifetimeBudget: 0,
    campaignDailyBudget: 0,
    campaignBudgetRemaining: 0,
    ...overrides,
  };
}

/** 觸發 spend > 100 的規則列（結構與 prisma AlertRule 相容） */
const TRIGGER_RULE = {
  id: "rule-1",
  userId: "user-1",
  name: "花費監控",
  metric: "spend",
  condition: "gt",
  threshold: 100,
  platform: "all",
  campaignFilter: null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOW = new Date("2026-07-04T08:30:00+08:00");

beforeEach(() => {
  settingsFindMany.mockReset();
  ruleFindMany.mockReset();
  fetchWindsorMock.mockReset();
  pushFlexMock.mockReset();
  pushTextMock.mockReset();
  saveMock.mockReset();

  ruleFindMany.mockResolvedValue([] as never);
  fetchWindsorMock.mockResolvedValue({ data: [makeRecord()] } as never);
  pushFlexMock.mockResolvedValue({ ok: true, status: 200 });
  pushTextMock.mockResolvedValue({ ok: true, status: 200 });
  saveMock.mockResolvedValue({ newAlerts: [], notifications: [] });
});

describe("getAppUrl", () => {
  it("未設 NEXT_PUBLIC_APP_URL 時回 localhost", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("runDailyDigestForAllUsers", () => {
  it("缺 LINE token 的使用者跳過，不推播", async () => {
    settingsFindMany.mockResolvedValue([
      makeSettings({ lineChannelToken: null }),
    ] as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).not.toHaveBeenCalled();
    expect(pushTextMock).not.toHaveBeenCalled();
  });

  it("正常使用者收到 Flex 摘要推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    const [token, to, bubble, altText] = pushFlexMock.mock.calls[0];
    expect(token).toBe("line-token"); // dev 環境 decrypt 回原文
    expect(to).toBe("U123");
    expect((bubble as { type: string }).type).toBe("bubble");
    expect(altText).toContain("2026-07-03");
  });

  it("第一位使用者 Windsor 失敗，第二位仍收到推播（錯誤隔離）", async () => {
    settingsFindMany.mockResolvedValue([
      makeSettings({ userId: "user-1" }),
      makeSettings({ id: "settings-2", userId: "user-2", lineRecipientId: "U456" }),
    ] as never);
    fetchWindsorMock
      .mockRejectedValueOnce(new Error("Windsor 掛了"))
      .mockResolvedValueOnce({ data: [makeRecord()] } as never);

    await runDailyDigestForAllUsers(NOW);

    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    expect(pushFlexMock.mock.calls[0][1]).toBe("U456");
  });

  it("LINE 推播失敗（ok:false）不 throw", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    pushFlexMock.mockResolvedValue({ ok: false, status: 429, error: "limit" });

    await expect(runDailyDigestForAllUsers(NOW)).resolves.toBeUndefined();
  });
});

describe("runAnomalyCheckForAllUsers", () => {
  it("無啟用規則：不抓 Windsor、不推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([] as never);

    await runAnomalyCheckForAllUsers(NOW);

    expect(fetchWindsorMock).not.toHaveBeenCalled();
    expect(pushFlexMock).not.toHaveBeenCalled();
  });

  it("newAlerts 為空（今日已通知過）：寫入去重後不推播", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([TRIGGER_RULE] as never);
    // 最新日 spend 200 > 閾值 100 → checkRules 會觸發
    fetchWindsorMock.mockResolvedValue({
      data: [
        makeRecord({ date: "2026-07-02", spend: 50 }),
        makeRecord({ date: "2026-07-03", spend: 200 }),
      ],
    } as never);
    saveMock.mockResolvedValue({ newAlerts: [], notifications: [] });

    await runAnomalyCheckForAllUsers(NOW);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(pushFlexMock).not.toHaveBeenCalled();
  });

  it("有新寫入異常：先寫 DB 再推 Flex", async () => {
    settingsFindMany.mockResolvedValue([makeSettings()] as never);
    ruleFindMany.mockResolvedValue([TRIGGER_RULE] as never);
    fetchWindsorMock.mockResolvedValue({
      data: [
        makeRecord({ date: "2026-07-02", spend: 50 }),
        makeRecord({ date: "2026-07-03", spend: 200 }),
      ],
    } as never);
    saveMock.mockImplementation(async (_userId, alerts) => ({
      newAlerts: alerts,
      notifications: [],
    }));

    await runAnomalyCheckForAllUsers(NOW);

    expect(saveMock).toHaveBeenCalledTimes(1);
    // saveNewAlertNotifications 收到 checkRules 的觸發結果
    expect(saveMock.mock.calls[0][1].length).toBeGreaterThan(0);
    expect(pushFlexMock).toHaveBeenCalledTimes(1);
    const altText = pushFlexMock.mock.calls[0][3];
    expect(altText).toContain("件");
  });
});
```

- [ ] 2. 跑測試看它失敗：

```bash
npx vitest run src/lib/cron/__tests__/monitor-jobs.test.ts
```

預期：模組解析錯誤（`../monitor-jobs` 不存在）。

- [ ] 3. 實作 `src/lib/cron/monitor-jobs.ts`：

```typescript
import type { UserSettings } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptApiKey } from "@/lib/utils/crypto";
import { fetchWindsor } from "@/lib/windsor/client";
import {
  buildInitiativeQuery,
  buildAdPerformanceQuery,
} from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";
import { saveNewAlertNotifications } from "@/lib/alerts/dedupe";
import { mergeAccountBudgets } from "@/lib/settings/account-budgets";
import {
  buildDailySummary,
  deriveDigestDates,
} from "@/lib/digest/build-daily-summary";
import { pushFlex, pushText } from "@/lib/line/client";
import {
  buildDigestFlex,
  buildAlertFlex,
  buildDigestText,
  buildAlertText,
} from "@/lib/line/flex";

/** 應用網址（LINE 訊息按鈕連結用） */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/** 解密後的推播憑證 */
interface ResolvedCredentials {
  channelToken: string;
  recipientId: string;
  windsorApiKey: string;
}

/**
 * 取出並解密使用者憑證；缺任一項或解密失敗（ENCRYPTION_KEY 錯誤）
 * 都記 log 回 null，由呼叫端跳過該使用者。
 */
function resolveCredentials(settings: UserSettings): ResolvedCredentials | null {
  if (
    !settings.lineChannelToken ||
    !settings.lineRecipientId ||
    !settings.windsorApiKey
  ) {
    console.log(
      `[monitor] 使用者 ${settings.userId} 缺 LINE/Windsor 憑證，跳過`,
    );
    return null;
  }
  try {
    return {
      channelToken: decryptApiKey(settings.lineChannelToken),
      recipientId: settings.lineRecipientId,
      windsorApiKey: decryptApiKey(settings.windsorApiKey),
    };
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} 憑證解密失敗（檢查 ENCRYPTION_KEY）:`,
      error,
    );
    return null;
  }
}

/** 取出所有啟用 LINE 推播的使用者設定 */
function getLineEnabledSettings(): Promise<UserSettings[]> {
  return prisma.userSettings.findMany({ where: { linePushEnabled: true } });
}

/** 單一使用者的每日摘要 */
async function runDailyDigestForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  const creds = resolveCredentials(settings);
  if (!creds) return;

  // 抓 60 天資料（涵蓋整個月＋昨日）。
  // 摘要需要預算欄位，必須用 initiative 查詢（AdPerformance 欄位組沒有預算欄位）。
  let records;
  try {
    const query = buildInitiativeQuery("all", "last_60d");
    const result = await fetchWindsor(creds.windsorApiKey, query);
    records = result.data;
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Windsor 抓取失敗:`,
      error,
    );
    return;
  }

  // 規則檢查（摘要僅呈現件數與內容，不寫 DB、不去重——寫入由盤中異常任務負責）
  const rules = await prisma.alertRule.findMany({
    where: { userId: settings.userId, enabled: true },
  });
  const alerts = checkRules(rules, records);

  // DB 的 accountBudgets 是未驗證 JSON，過 mergeAccountBudgets 淨化
  const manualBudgets = mergeAccountBudgets(settings.accountBudgets, {});
  const summary = buildDailySummary(records, {
    manualBudgets,
    today: now,
    daysInMonth: deriveDigestDates(now).daysInMonth,
    alerts,
  });

  const appUrl = getAppUrl();
  const altText = `每日廣告摘要 ${summary.date}`;
  let result;
  try {
    const bubble = buildDigestFlex(summary, appUrl);
    result = await pushFlex(creds.channelToken, creds.recipientId, bubble, altText);
  } catch (error) {
    // Flex 組裝異常 → 退純文字備援
    console.error(
      `[monitor] 使用者 ${settings.userId} Flex 組裝失敗，改用純文字:`,
      error,
    );
    result = await pushText(
      creds.channelToken,
      creds.recipientId,
      buildDigestText(summary, appUrl),
    );
  }

  if (!result.ok) {
    // LINE API 4xx/5xx/429 → 記 log 放棄，不重試
    console.error(
      `[monitor] 使用者 ${settings.userId} LINE 推播失敗: status=${result.status} error=${result.error}`,
    );
  }
}

/** 每日摘要：對所有啟用 LINE 推播的使用者逐一執行（彼此錯誤隔離） */
export async function runDailyDigestForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await getLineEnabledSettings();
  console.log(`[monitor] 每日摘要開始，共 ${allSettings.length} 位使用者`);

  for (const settings of allSettings) {
    try {
      await runDailyDigestForUser(settings, now);
    } catch (error) {
      console.error(
        `[monitor] 使用者 ${settings.userId} 每日摘要失敗:`,
        error,
      );
    }
  }
}

/** 單一使用者的盤中異常檢查 */
async function runAnomalyCheckForUser(
  settings: UserSettings,
  now: Date,
): Promise<void> {
  const creds = resolveCredentials(settings);
  if (!creds) return;

  const rules = await prisma.alertRule.findMany({
    where: { userId: settings.userId, enabled: true },
  });
  if (rules.length === 0) return;

  // 與既有 /api/alerts/check 相同的資料範圍（last_14d、AdPerformance 欄位組）
  let records;
  try {
    const query = buildAdPerformanceQuery("all", "last_14d");
    const result = await fetchWindsor(creds.windsorApiKey, query);
    records = result.data;
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Windsor 抓取失敗:`,
      error,
    );
    return;
  }

  const triggered = checkRules(rules, records);
  const { newAlerts } = await saveNewAlertNotifications(
    settings.userId,
    triggered,
    now,
  );

  // 今日已通知過的規則不再推播（不打擾）
  if (newAlerts.length === 0) return;

  const appUrl = getAppUrl();
  const altText = `廣告異常提醒（${newAlerts.length} 件）`;
  let result;
  try {
    const bubble = buildAlertFlex(newAlerts, appUrl);
    result = await pushFlex(creds.channelToken, creds.recipientId, bubble, altText);
  } catch (error) {
    console.error(
      `[monitor] 使用者 ${settings.userId} Flex 組裝失敗，改用純文字:`,
      error,
    );
    result = await pushText(
      creds.channelToken,
      creds.recipientId,
      buildAlertText(newAlerts, appUrl),
    );
  }

  if (!result.ok) {
    console.error(
      `[monitor] 使用者 ${settings.userId} LINE 推播失敗: status=${result.status} error=${result.error}`,
    );
  }
}

/** 盤中異常檢查：對所有啟用 LINE 推播的使用者逐一執行（彼此錯誤隔離） */
export async function runAnomalyCheckForAllUsers(
  now: Date = new Date(),
): Promise<void> {
  const allSettings = await getLineEnabledSettings();
  console.log(
    `[monitor] 盤中異常檢查開始，共 ${allSettings.length} 位使用者`,
  );

  for (const settings of allSettings) {
    try {
      await runAnomalyCheckForUser(settings, now);
    } catch (error) {
      console.error(
        `[monitor] 使用者 ${settings.userId} 異常檢查失敗:`,
        error,
      );
    }
  }
}
```

- [ ] 4. 跑測試變綠：

```bash
npx vitest run src/lib/cron/__tests__/monitor-jobs.test.ts
```

預期：`Tests  8 passed`。

- [ ] 5. 改寫 `src/lib/cron/scheduler.ts`（保留 singleton 與 `isCronInitialized`，加兩個 node-cron 任務）。整檔改寫為：

```typescript
import cron from "node-cron";
import { initDynamicScheduler } from "./dynamic-scheduler";
import {
  runDailyDigestForAllUsers,
  runAnomalyCheckForAllUsers,
} from "./monitor-jobs";

// 使用 singleton pattern 確保只初始化一次
let cronInitialized = false;

/**
 * 初始化 Cron Jobs
 * 使用 singleton pattern 確保在 Next.js 環境中只執行一次
 */
export function initCronJobs(): void {
  if (cronInitialized) {
    return;
  }

  // 初始化動態排程系統（多租戶 SaaS）
  initDynamicScheduler();

  // 每日摘要：台北時間 08:30
  cron.schedule(
    "30 8 * * *",
    () => {
      runDailyDigestForAllUsers().catch((error) => {
        console.error("[cron] 每日摘要任務失敗:", error);
      });
    },
    { timezone: "Asia/Taipei" },
  );

  // 盤中異常檢查：台北時間 10 / 14 / 18 / 22 點
  cron.schedule(
    "0 10,14,18,22 * * *",
    () => {
      runAnomalyCheckForAllUsers().catch((error) => {
        console.error("[cron] 盤中異常檢查任務失敗:", error);
      });
    },
    { timezone: "Asia/Taipei" },
  );

  console.log(
    "[cron] LINE 監控排程已啟動（每日 08:30 摘要、10/14/18/22 異常檢查，Asia/Taipei）",
  );

  cronInitialized = true;
}

/**
 * 取得 Cron 初始化狀態（用於測試）
 */
export function isCronInitialized(): boolean {
  return cronInitialized;
}
```

- [ ] 6. 新增 `src/instrumentation.ts`（Next.js 伺服器啟動即初始化排程，不再依賴 sync-notion 路由被打到才啟動；既有呼叫點 `src/app/api/sync-notion/route.ts` 不動——`initCronJobs` 是 singleton，重複呼叫無害）：

```typescript
/**
 * Next.js instrumentation hook — 伺服器啟動時初始化 cron 排程
 * 只在 Node.js runtime 執行（避免 edge runtime 載入 node-cron）
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCronJobs } = await import("@/lib/cron/scheduler");
    initCronJobs();
  }
}
```

- [ ] 7. 全量驗證＋實跑 dev server 確認啟動 log：

```bash
npx tsc --noEmit && npx vitest run
npm run dev
```

預期：vitest `Tests  281 passed`（273＋8）；dev server 終端出現一行 `[cron] LINE 監控排程已啟動（每日 08:30 摘要、10/14/18/22 異常檢查，Asia/Taipei）`。確認後 Ctrl+C 關閉。

- [ ] 8. Commit：

```bash
git add src/lib/cron/ src/instrumentation.ts
git commit -m "$(cat <<'EOF'
feat(cron): LINE 每日摘要與盤中異常推播任務（Asia/Taipei、逐使用者錯誤隔離、instrumentation 啟動）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：測試推播 API `/api/line/test`

**Files:**

- Create: `src/app/api/line/test/route.ts`
- Test: 無單元測試（薄 glue）；以 `npx tsc --noEmit`＋curl 實跑為驗收

**Interfaces:**

- Consumes: `getCurrentUser`（`@/lib/auth/clerk`）、`withRateLimit(request, config?, opts?)`（`@/lib/utils/with-rate-limit`，同步函式回 `NextResponse | null`）、`getUserSettings`（`@/lib/db/repositories/user-settings`）、`decryptApiKey`、`pushFlex`／`pushText`（Task 2）、`buildTestFlex`（Task 4）、`getAppUrl`（Task 6）
- Produces: `POST /api/line/test` — 無請求參數（**因此不需要 Zod schema**；body 完全不讀）。回應：
  - 200 `{ success: true, message }` 推播成功
  - 412 `{ error }` 尚未儲存 LINE 憑證
  - 502 `{ error, status, details }` LINE API 拒絕（token 或 recipientId 錯誤）
  - 429 由 `withRateLimit` 回（每分鐘 5 次，防止拿此端點騷擾 LINE API）
  - 500 未預期錯誤（production 不洩漏 error.message）

**Steps:**

- [ ] 1. 建立 `src/app/api/line/test/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/clerk";
import { withRateLimit } from "@/lib/utils/with-rate-limit";
import { getUserSettings } from "@/lib/db/repositories/user-settings";
import { decryptApiKey } from "@/lib/utils/crypto";
import { pushFlex, pushText } from "@/lib/line/client";
import { buildTestFlex } from "@/lib/line/flex";
import { getAppUrl } from "@/lib/cron/monitor-jobs";

/**
 * POST /api/line/test
 * 用「已儲存」的 LINE 憑證發送測試訊息（無請求參數，不讀 body）
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // 速率限制：每分鐘 5 次（以使用者為單位）
    const limited = withRateLimit(
      request,
      { maxRequests: 5, windowMs: 60_000 },
      { identifier: user.id },
    );
    if (limited) return limited;

    const settings = await getUserSettings(user.id);
    if (!settings?.lineChannelToken || !settings?.lineRecipientId) {
      return NextResponse.json(
        { error: "尚未設定 LINE Channel Token 或接收者 ID，請先儲存設定" },
        { status: 412 },
      );
    }

    const channelToken = decryptApiKey(settings.lineChannelToken);
    const appUrl = getAppUrl();

    // 先推 Flex；失敗（例如 Flex 被拒）退純文字再試一次
    let result = await pushFlex(
      channelToken,
      settings.lineRecipientId,
      buildTestFlex(appUrl),
      "Ad Manager Pro 測試訊息",
    );
    if (!result.ok) {
      result = await pushText(
        channelToken,
        settings.lineRecipientId,
        `Ad Manager Pro 測試訊息：LINE 推播設定成功！\n${appUrl}/daily`,
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "LINE 推播失敗，請檢查 Channel Token 與接收者 ID",
          status: result.status,
          details: result.error,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "測試訊息已送出，請查看 LINE",
    });
  } catch (error) {
    console.error("LINE 測試推播失敗:", error);
    return NextResponse.json(
      {
        error: "LINE 測試推播失敗",
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

- [ ] 2. 驗證（dev server 需在跑；本機未存 LINE 憑證時預期 412）：

```bash
npx tsc --noEmit && npx vitest run
curl -s -X POST http://localhost:3000/api/line/test
```

預期：tsc 無錯誤；vitest 全綠（281）；curl 回 `{"error":"尚未設定 LINE Channel Token 或接收者 ID，請先儲存設定"}`。

- [ ] 3. Commit：

```bash
git add src/app/api/line/
git commit -m "$(cat <<'EOF'
feat(line): 測試推播 API（412 未設定、502 LINE 拒絕、每分鐘 5 次限流）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8：設定頁 LINE 區塊

**Files:**

- Create: `src/components/settings/line-section.tsx`
- Modify: `src/components/settings/index.ts`
- Modify: `src/app/settings/page.tsx`
- Test: 無單元測試（UI）；以 `npx tsc --noEmit`＋dev server 手動驗證為主

**Interfaces:**

- Consumes: `SettingsSection`、`ToggleVisibility`、`ToggleField`（`src/components/settings/` 既有共用元件，props 介面與 `notion-section.tsx` 用法完全相同）；`POST /api/line/test`（Task 7）
- Produces: `LineSection`（受控元件，狀態由 page.tsx 持有——與 Windsor/Notion Section 同模式）；`GET /api/settings` 的 `line` 欄位（Task 1 已回 `{ hasLineToken, recipientId, enabled }`）；`PATCH /api/settings` 的 `line` 欄位

**Steps:**

- [ ] 1. 建立 `src/components/settings/line-section.tsx`（注意：`notion-section.tsx` 的說明框用了硬色票 `bg-blue-50` 舊碼，**本區塊不照抄**，改用 token `bg-info/10 border-info/20 text-info`）：

```tsx
"use client";

import { useState } from "react";
import { SettingsSection } from "./settings-section";
import { ToggleVisibility } from "./toggle-visibility";
import { ToggleField } from "./toggle-field";

export interface LineSectionProps {
  channelToken: string;
  onChannelTokenChange: (value: string) => void;
  recipientId: string;
  onRecipientIdChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  hasToken: boolean;
  showToken: boolean;
  onToggleShowToken: () => void;
}

/** LINE 推播設定區塊 */
export function LineSection({
  channelToken,
  onChannelTokenChange,
  recipientId,
  onRecipientIdChange,
  enabled,
  onEnabledChange,
  hasToken,
  showToken,
  onToggleShowToken,
}: LineSectionProps) {
  // 測試推播狀態（區塊內部自理，不上提）
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // 測試推播：用「已儲存」的設定發一則測試訊息
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/line/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message });
      } else {
        setTestResult({ ok: false, message: data.error || "測試失敗" });
      }
    } catch {
      setTestResult({ ok: false, message: "測試失敗，請檢查網路連線" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsSection
      title="LINE 推播"
      description="每日 08:30 摘要與盤中異常提醒，推送到你的 LINE"
      badge={hasToken ? (enabled ? "已啟用" : "已停用") : undefined}
      badgeColor="text-success bg-success/10"
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
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      }
    >
      <div className="space-y-4">
        {/* 設定步驟說明（用 info token，不用硬色票） */}
        <div className="bg-info/10 border border-info/20 rounded-lg p-3 text-xs text-info space-y-1">
          <p className="font-medium">設定步驟：</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>到 LINE Developers Console 建立 Messaging API channel</li>
            <li>在 Messaging API 分頁發行 Channel access token（長效）</li>
            <li>用手機加該官方帳號為好友，並取得你的 userId（Basic settings 頁的 Your user ID）</li>
          </ol>
        </div>

        {/* Channel Access Token */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Channel Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={channelToken}
              onChange={(e) => onChannelTokenChange(e.target.value)}
              placeholder={
                hasToken
                  ? "留空代表不變更已儲存的 Token"
                  : "貼上 LINE Channel Access Token..."
              }
              className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
            />
            <ToggleVisibility show={showToken} onToggle={onToggleShowToken} />
          </div>
        </div>

        {/* 接收者 userId */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            接收者 User ID
          </label>
          <input
            type="text"
            value={recipientId}
            onChange={(e) => onRecipientIdChange(e.target.value)}
            placeholder="U 開頭的 LINE userId..."
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
          />
        </div>

        {/* 啟用開關 */}
        <ToggleField
          label="啟用 LINE 每日摘要推播"
          checked={enabled}
          onChange={onEnabledChange}
        />

        {/* 測試推播（用已儲存的設定） */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 text-sm border border-card-border rounded-lg hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {testing ? "傳送中..." : "發送測試訊息"}
          </button>
          {testResult && (
            <span
              className={`text-sm animate-fade-in ${
                testResult.ok ? "text-success" : "text-danger"
              }`}
            >
              {testResult.message}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          測試使用「已儲存」的設定——修改 Token 後請先按下方「儲存所有設定」再測試。
        </p>
      </div>
    </SettingsSection>
  );
}
```

> 注意：`SettingsSection`／`ToggleVisibility`／`ToggleField` 的 import 路徑與 props 以 `src/components/settings/notion-section.tsx` 實際寫法為準——實作前先打開該檔比對（若共用元件是從 `./settings-section` 之外的路徑匯出，跟著既有寫法改）。

- [ ] 2. 修改 `src/components/settings/index.ts`，比照既有 export pattern 追加兩行：

```typescript
export { LineSection } from "./line-section";
export type { LineSectionProps } from "./line-section";
```

- [ ] 3. 修改 `src/app/settings/page.tsx`——四處：

3a. import 加入 `LineSection`：

```typescript
import {
  WindsorSection,
  NotionSection,
  LineSection,
  ScheduleSection,
  ThresholdSection,
} from "@/components/settings";
```

3b. 在「Notion 設定」state 區塊後加 LINE state：

```typescript
  // LINE 推播設定
  const [lineToken, setLineToken] = useState("");
  const [lineRecipientId, setLineRecipientId] = useState("");
  const [lineEnabled, setLineEnabled] = useState(false);
  const [hasLineToken, setHasLineToken] = useState(false);
  const [showLineToken, setShowLineToken] = useState(false);
```

3c. `loadSettings()` 內、`if (data.notion) {...}` 之後加：

```typescript
        if (data.line) {
          setHasLineToken(data.line.hasLineToken);
          setLineRecipientId(data.line.recipientId || "");
          setLineEnabled(data.line.enabled ?? false);
        }
```

3d. `handleSaveAll()` 的 PATCH body 中、`notion: {...},` 之後加：

```typescript
            line: {
              channelToken: lineToken || undefined,
              recipientId: lineRecipientId || undefined,
              enabled: lineEnabled,
            },
```

並在儲存成功清空區（`setNotionApiKey("");` 之後）加：

```typescript
      if (lineToken) setHasLineToken(true);
      setLineToken("");
```

3e. JSX 中 `<NotionSection ... />` 之後插入：

```tsx
        <LineSection
          channelToken={lineToken}
          onChannelTokenChange={setLineToken}
          recipientId={lineRecipientId}
          onRecipientIdChange={setLineRecipientId}
          enabled={lineEnabled}
          onEnabledChange={setLineEnabled}
          hasToken={hasLineToken}
          showToken={showLineToken}
          onToggleShowToken={() => setShowLineToken(!showLineToken)}
        />
```

- [ ] 4. 驗證：

```bash
npx tsc --noEmit && npx vitest run
npm run dev
```

預期：tsc 無錯誤、vitest 全綠（281）。瀏覽器開 `http://localhost:3000/settings` 手動確認：

1. LINE 區塊顯示於 Notion 區塊之後，含說明框、Token 密碼欄、User ID 欄、啟用開關、測試按鈕
2. 未儲存憑證時按「發送測試訊息」→ inline 顯示紅字「尚未設定 LINE Channel Token 或接收者 ID，請先儲存設定」（412）
3. 填 Token＋User ID → 儲存所有設定 → 重新整理後 badge 顯示「已啟用/已停用」、Token 欄 placeholder 變「留空代表不變更已儲存的 Token」
4. 測試按鈕在傳送中呈 disabled＋「傳送中...」

- [ ] 5. Commit：

```bash
git add src/components/settings/ src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(settings): LINE 推播設定區塊（token 密碼欄、啟用開關、測試推播按鈕）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9：`/daily` 行動摘要頁

**Files:**

- Create: `src/app/daily/page.tsx`
- Test: 無單元測試（UI；核心運算已在 Task 3 覆蓋）；以 `npx tsc --noEmit`＋dev server 手動驗證為主

**Interfaces:**

- Consumes:
  - `useApiKey(): { hasApiKey, ready }`、`useWindsorData(dateRange, platform, level?): { data, loading, error, refetch }`（`@/hooks/use-windsor-data`）
  - `useAccountBudgets(): { budgets, saveBudget }`（`@/hooks/use-account-budgets`）
  - `buildDailySummary`、`deriveDigestDates`（Task 3）
  - `pacingLevel`、`PACING_TEXT`、`PACING_BG`（`@/lib/initiatives/pacing`）
  - `formatCurrency`、`formatRoas`（`@/lib/utils/format`）
  - `LoadingSpinner`（`@/components/ui/loading-spinner`，default export）、`EmptyState`（`@/components/ui/empty-state`，default export）
  - `GET /api/alerts/notifications?limit=50`（既有路由；client 端以台北今日 00:00 過濾）
- Produces: `/daily` 頁（行動優先單欄、PWA start_url 目標頁）

**UI 四態**：loading → `LoadingSpinner`；error → danger token 卡片＋重試按鈕；empty（無資料）→ `EmptyState`；success → 摘要卡片。另 `useApiKey` 未設 key → `EmptyState` 導去設定頁。

**Steps:**

- [ ] 1. 建立 `src/app/daily/page.tsx`：

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApiKey, useWindsorData } from "@/hooks/use-windsor-data";
import { useAccountBudgets } from "@/hooks/use-account-budgets";
import {
  buildDailySummary,
  deriveDigestDates,
} from "@/lib/digest/build-daily-summary";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency, formatRoas } from "@/lib/utils/format";
import LoadingSpinner from "@/components/ui/loading-spinner";
import EmptyState from "@/components/ui/empty-state";

/** 今日異常通知（來自 /api/alerts/notifications） */
interface DailyNotification {
  id: string;
  title: string;
  message: string;
  severity: string;
  createdAt: string;
}

/** severity → 圓點顏色 token */
const SEVERITY_BG: Record<string, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export default function DailyPage() {
  const { hasApiKey, ready } = useApiKey();

  if (!ready) {
    return <LoadingSpinner message="載入設定中..." />;
  }

  if (!hasApiKey) {
    return (
      <EmptyState
        title="尚未設定 Windsor API Key"
        description="請先到設定頁儲存 Windsor API Key，才能載入每日摘要"
        actionLabel="前往設定"
        actionHref="/settings"
      />
    );
  }

  return <DailyContent />;
}

function DailyContent() {
  // 摘要用 60 天資料（涵蓋整月＋昨日），initiative 層級才有預算欄位
  const { data, loading, error, refetch } = useWindsorData(
    "last_60d",
    "all",
    "initiative",
  );
  const { budgets } = useAccountBudgets();

  // 今日異常通知（載入失敗靜默，不阻塞摘要）
  const [notifications, setNotifications] = useState<DailyNotification[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const res = await fetch("/api/alerts/notifications?limit=50");
        if (!res.ok) return;
        const json = await res.json();
        const list: DailyNotification[] = json.notifications ?? [];
        // 以台北時區的「今日 00:00」過濾
        const todayStr = new Date().toLocaleDateString("sv", {
          timeZone: "Asia/Taipei",
        });
        const startOfToday = new Date(`${todayStr}T00:00:00+08:00`);
        const todays = list.filter(
          (n) => new Date(n.createdAt) >= startOfToday,
        );
        if (!cancelled) setNotifications(todays);
      } catch {
        // 通知載入失敗不阻塞頁面
      }
    }
    loadNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (data.length === 0) return null;
    const now = new Date();
    return buildDailySummary(data, {
      manualBudgets: budgets,
      today: now,
      daysInMonth: deriveDigestDates(now).daysInMonth,
    });
  }, [data, budgets]);

  // ── loading 態 ──
  if (loading) {
    return <LoadingSpinner message="載入每日摘要中..." />;
  }

  // ── error 態 ──
  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-md mx-auto">
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 space-y-3">
          <p className="text-sm text-danger font-medium">載入失敗：{error}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  // ── empty 態 ──
  if (!summary) {
    return (
      <EmptyState
        title="尚無資料"
        description="Windsor 尚未回傳任何廣告資料，請稍後再試或檢查資料範圍"
      />
    );
  }

  // ── success 態 ──
  const progressPct =
    summary.monthProgress !== null ? summary.monthProgress * 100 : null;
  const level = summary.monthProgress !== null
    ? pacingLevel(summary.monthProgress)
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto space-y-4 animate-fade-in">
      {/* 基準日 */}
      <p className="text-xs text-muted">資料基準日：{summary.date}</p>

      {/* 昨日花費 */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <p className="text-xs text-muted mb-1">昨日花費</p>
        <p className="text-3xl font-bold font-mono tabular-nums text-foreground">
          {formatCurrency(summary.yesterdaySpend)}
        </p>
      </div>

      {/* 本月配速 */}
      <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">本月配速</p>
          {level !== null && progressPct !== null ? (
            <span
              className={`text-sm font-semibold font-mono tabular-nums ${PACING_TEXT[level]}`}
            >
              {progressPct.toFixed(0)}%
            </span>
          ) : (
            <span className="text-sm text-muted">未設定預算</span>
          )}
        </div>
        {level !== null && progressPct !== null && (
          // 進度條：軌道用 card-border（globals.css 沒有 track token）
          <div className="h-2 rounded-full bg-card-border overflow-hidden">
            <div
              className={`h-full rounded-full ${PACING_BG[level]}`}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted">本月花費</p>
            <p className="font-mono tabular-nums text-foreground">
              {formatCurrency(summary.monthSpend)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">本月預算</p>
            <p className="font-mono tabular-nums text-foreground">
              {summary.monthBudget > 0
                ? formatCurrency(summary.monthBudget)
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 昨日 ROAS / CPA */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted mb-1">昨日 ROAS</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            {summary.yesterdayRoas !== null
              ? formatRoas(summary.yesterdayRoas)
              : "—"}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted mb-1">昨日 CPA</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            {summary.yesterdayCpa !== null
              ? formatCurrency(summary.yesterdayCpa)
              : "—"}
          </p>
        </div>
      </div>

      {/* 今日異常 */}
      <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
        <p className="text-xs text-muted">今日異常（{notifications.length}）</p>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted">今日沒有觸發任何異常規則</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    SEVERITY_BG[n.severity] ?? "bg-info"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {n.title}
                  </p>
                  <p className="text-xs text-muted break-words">{n.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 快速連結 */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/initiatives"
          className="bg-card border border-card-border rounded-xl p-4 text-center text-sm font-medium text-accent hover:bg-accent-light transition-colors"
        >
          預算配速
        </Link>
        <Link
          href="/alerts"
          className="bg-card border border-card-border rounded-xl p-4 text-center text-sm font-medium text-accent hover:bg-accent-light transition-colors"
        >
          異常規則
        </Link>
      </div>
    </div>
  );
}
```

> 範圍紀律：不動側欄導覽（sidebar nav）。/daily 是給手機加入主畫面用的入口頁，桌面導覽不加項目——spec 未要求。

- [ ] 2. 驗證：

```bash
npx tsc --noEmit && npx vitest run
npm run dev
```

預期：tsc 無錯誤、vitest 全綠（281）。瀏覽器開 `http://localhost:3000/daily`（建議 DevTools 切手機視窗 390px）手動確認四態：

1. 初載顯示「載入每日摘要中...」spinner
2. 未設 Windsor key → EmptyState「尚未設定 Windsor API Key」＋前往設定按鈕
3. 有資料 → 昨日花費大數字、本月配速條顏色與 /initiatives 一致、ROAS/CPA、今日異常清單（無異常顯示灰字說明）、兩顆快速連結可點
4. 中斷網路重整 → danger 卡片＋重試按鈕，按下後 refetch

- [ ] 3. Commit：

```bash
git add src/app/daily/
git commit -m "$(cat <<'EOF'
feat(daily): /daily 行動摘要頁（昨日花費、本月配速、ROAS/CPA、今日異常、四態齊備）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10：PWA manifest 與圖示

**Files:**

- Create: `src/app/icon.svg`
- Create: `scripts/generate-icons.mjs`
- Create: `src/app/manifest.ts`
- Generated: `public/icon-192.png`、`public/icon-512.png`
- Modify: 無（`src/middleware.ts` 的 matcher 已排除 `webmanifest|png|svg|ico` 等靜態資源，**零改動**）
- Test: 無單元測試；以 curl 驗證 manifest 路由

**Interfaces:**

- Produces: `manifest(): MetadataRoute.Manifest`（Next.js App Router 慣例，自動 serve 於 `/manifest.webmanifest`）；PWA 圖示兩檔

**Steps:**

- [ ] 1. 建立 `src/app/icon.svg`（512 視窗、靛底圓角方形＋三支白色長條 bar-chart 圖形；hex `#4f46e5` 對齊 globals.css 的 accent。spec 寫「白字」，這裡改用圖形以避免 SVG 字型在無字型環境 render 不一致——功能等價的品牌圖示）：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- 靛色圓角底（對齊 accent #4f46e5） -->
  <rect width="512" height="512" rx="96" fill="#4f46e5"/>
  <!-- 三支白色長條：由低到高的 bar chart -->
  <rect x="112" y="256" width="64" height="144" rx="16" fill="#ffffff"/>
  <rect x="224" y="176" width="64" height="224" rx="16" fill="#ffffff"/>
  <rect x="336" y="112" width="64" height="288" rx="16" fill="#ffffff"/>
</svg>
```

- [ ] 2. 安裝 sharp（僅建置期用，devDependency）並建立產圖腳本 `scripts/generate-icons.mjs`：

```bash
npm i -D sharp
```

```javascript
// 從 src/app/icon.svg 產生 PWA 用 PNG 圖示（192 / 512）
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "src/app/icon.svg";

await mkdir("public", { recursive: true });

for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  await sharp(SRC, { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`已產生 ${out}`);
}
```

執行：

```bash
node scripts/generate-icons.mjs
```

預期輸出：

```
已產生 public/icon-192.png
已產生 public/icon-512.png
```

- [ ] 3. 建立 `src/app/manifest.ts`：

```typescript
import type { MetadataRoute } from "next";

/** PWA manifest — 手機「加入主畫面」後直接開 /daily */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ad Manager Pro",
    short_name: "AdManager",
    description: "廣告帳戶每日摘要與異常監控",
    start_url: "/daily",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

- [ ] 4. 驗證：

```bash
npx tsc --noEmit && npx vitest run
npm run dev
curl -sI http://localhost:3000/manifest.webmanifest | head -3
curl -sI http://localhost:3000/icon-192.png | head -3
```

預期：tsc 無錯誤、vitest 全綠（281）；兩個 curl 皆回 `HTTP/1.1 200 OK`（middleware 不攔截）。手機（或 DevTools Application 分頁）確認 manifest 讀得到、start_url 為 `/daily`。

- [ ] 5. Commit：

```bash
git add src/app/icon.svg src/app/manifest.ts scripts/generate-icons.mjs public/icon-192.png public/icon-512.png package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(pwa): manifest（start_url /daily）＋靛底 bar-chart 圖示 192/512

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## 完成後整體驗證

- [ ] 1. 全量測試與型別檢查：

```bash
npx tsc --noEmit && npx vitest run
```

預期：tsc 無錯誤；vitest `Tests  281 passed`（基準 241＋T2 6＋T3 10＋T4 11＋T5 5＋T6 8）。

- [ ] 2. dev server 啟動確認 cron log 一行（Task 6 的啟動訊息）。
- [ ] 3. 手動流程走一遍：設定頁存 LINE 憑證 → 發送測試訊息 → 手機收到 → 開 `/daily` 確認四態 → 手機加入主畫面開啟直達 `/daily`。

---

## Self-Review 紀錄

計畫完成後執行的自我檢查（2026-07-04）：

| 檢查項 | 結果 |
|--------|------|
| Spec 逐節覆蓋 | 資料模型→T1；LINE client→T2；摘要運算→T3；Flex 訊息→T4；去重共用→T5；排程/instrumentation→T6；測試推播 API→T7；設定 UI→T8；/daily 頁→T9；PWA→T10 |
| Spec「錯誤處理」表逐列落實 | 缺憑證跳過／解密失敗／Windsor 失敗／Flex 異常退純文字／LINE 4xx/5xx/429 記 log 放棄／使用者間錯誤隔離／已通知不重推 → 全在 T6（含對照表）；測試 API 的 412/502/429/500 → T7；通知載入失敗靜默 → T9 |
| Placeholder 掃描 | 無 TBD／TODO／「同 Task N」；每個 task 有完整程式碼與確切指令 |
| 跨 task 簽名一致 | `pushFlex(token, to, bubble, altText)`／`LinePushResult { ok, status?, error? }`（T2→T6/T7）、`buildDailySummary(records, options)`／`deriveDigestDates(now)`（T3→T6/T9）、`buildDigestFlex(summary, appUrl)`／`buildAlertFlex(alerts, appUrl)`／`buildTestFlex(appUrl)`（T4→T6/T7）、`saveNewAlertNotifications(userId, alerts, now?)`（T5→T6）、`getAppUrl()`（T6→T7）均一致 |
| 既有程式碼簽名核對 | `withRateLimit`（同步、回 `NextResponse | null`）、`useApiKey`／`useWindsorData(dateRange, platform, level?)`、`useAccountBudgets`、`pacingLevel`／`PACING_TEXT`／`PACING_BG`、`aggregateAccounts(records, days, budgetOptions?)`、`AccountSummary`（自 `initiatives/types.ts`）、`mergeAccountBudgets(existing, patch)`、settings route 的 notion pattern——皆以實讀檔案為準 |
| 安全要點 | LINE token 加密比照 windsorApiKey（T1 PATCH 用 `encryptApiKey`）；GET settings 只回 `hasLineToken` 布林、不回 token 值（T1）；憑證由使用者部署後自行貼入，計畫不含任何憑證值 |
| 設計系統 | UI 一律 token（`bg-info/10`、`bg-card-border`、PACING_* token）；唯一 hex 例外 = LINE Flex JSON 與 manifest/icon（非 Tailwind 環境），已在 Global Constraints 註明 |
| 語言檢查 | 全文掃描無日文假名、無簡體字；程式識別字之外皆繁體中文 |
| 測試數推演 | 241 → 247（T2）→ 257（T3）→ 268(T4) → 273（T5）→ 281（T6），各 task 驗證指令標注對應預期值 |

已知偏離 spec 之處（均已在對應 task 內文標註理由）：

1. 每日摘要資料查詢用 `buildInitiativeQuery("all", "last_60d")` 而非 spec 寫的 `buildAdPerformanceQuery`——後者欄位組沒有預算欄位，無法計算月配速。
2. 配速顏色門檻採既有 `pacingLevel()`（85–110 good）而非 spec 內文的 90–110——spec 同句要求「與 /initiatives 一致」，兩者矛盾時取一致性。
3. `/api/line/test` 無請求參數，故無 Zod schema（spec 的 Zod 要求對此端點無適用對象）。
4. `middleware.ts` 零改動——matcher 既已排除 manifest/圖示等靜態資源。
5. PWA 圖示用白色 bar-chart 圖形而非「白字」，避免 SVG 字型依賴。
6. `last_60d` preset 未在既有程式碼出現過，Windsor 是否支援未實測——若實測失敗，改用 `date_from`/`date_to` 自組 60 天區間（T3 的日期推導不受影響）。


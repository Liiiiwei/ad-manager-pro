import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@notionhq/client";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AccountSummary } from "@/lib/initiatives/types";
import type { DigestDates } from "@/lib/digest/build-daily-summary";

// 節流層直接透傳（測試不等 350ms）
vi.mock("@/lib/notion/client", () => ({
  withNotionThrottle: (fn: () => unknown) => fn(),
  createNotionClient: vi.fn(),
}));

import { buildDailyPerformanceRows, upsertDailyRows } from "../daily-rows";
import { PROP } from "../database-schemas";

/** 產生完整 WindsorAdRecord 測試記錄 */
function makeRecord(overrides: Partial<WindsorAdRecord> = {}): WindsorAdRecord {
  return {
    date: "2026-07-02",
    source: "meta",
    account_name: "帳戶A",
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

/** 產生 AccountSummary（月聚合結果） */
function makeAccount(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    accountName: "帳戶A",
    platform: "meta",
    spend: 3000,
    periodBudget: 10000,
    hasBudget: true,
    progress: 0.3,
    budgetSource: "manual",
    monthlyBudget: 10000,
    ...overrides,
  };
}

const DATES: DigestDates = {
  yesterday: "2026-07-02",
  monthStart: "2026-07-01",
  dayOfMonth: 3,
  daysInMonth: 31,
};

describe("buildDailyPerformanceRows", () => {
  it("昨日 records 按帳號聚合，join 月配速欄位", () => {
    const records = [
      makeRecord({ spend: 100, revenue: 500, conversions: 10 }),
      makeRecord({ spend: 50, revenue: 100, conversions: 5 }), // 同帳戶第二筆（不同 campaign）
      makeRecord({ date: "2026-07-01", spend: 999 }), // 非昨日 → 不計
    ];
    const rows = buildDailyPerformanceRows(records, [makeAccount()], DATES);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2026-07-02",
      accountName: "帳戶A",
      platform: "meta",
      spend: 150,
      revenue: 600,
      conversions: 15,
      roas: 4, // 600/150
      cpa: 10, // 150/15
      monthSpend: 3000,
      pacingRatio: 0.3,
      budgetSource: "manual",
      monthlyBudget: 10000,
      syncKey: "2026-07-02::帳戶A",
    });
  });

  it("帳號昨日無資料：仍出 row，花費 0、ROAS/CPA 留空", () => {
    const rows = buildDailyPerformanceRows(
      [makeRecord({ account_name: "帳戶A" })],
      [
        makeAccount(),
        makeAccount({ accountName: "帳戶B", platform: "google" }),
      ],
      DATES,
    );

    expect(rows).toHaveLength(2);
    const b = rows.find((r) => r.accountName === "帳戶B");
    expect(b).toMatchObject({ spend: 0, revenue: 0, conversions: 0 });
    expect(b?.roas).toBeNull();
    expect(b?.cpa).toBeNull();
  });

  it("除零留空：有花費無轉換 → cpa null；無花費 → roas null", () => {
    const rows = buildDailyPerformanceRows(
      [makeRecord({ spend: 100, revenue: 0, conversions: 0 })],
      [makeAccount()],
      DATES,
    );
    expect(rows[0].roas).toBe(0); // 100 花費、0 營收 → 0（可計算，非除零）
    expect(rows[0].cpa).toBeNull(); // 0 轉換 → 除零留空
  });

  it("無預算帳號：pacingRatio 留空", () => {
    const rows = buildDailyPerformanceRows(
      [makeRecord()],
      [
        makeAccount({
          hasBudget: false,
          progress: 0,
          budgetSource: undefined,
          monthlyBudget: undefined,
        }),
      ],
      DATES,
    );
    expect(rows[0].pacingRatio).toBeNull();
    expect(rows[0].budgetSource).toBeNull();
    expect(rows[0].monthlyBudget).toBeNull();
  });
});

/** 建 fake Notion client（只有 upsertDailyRows 會碰到的面） */
function makeNotion() {
  const query = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const notion = {
    dataSources: { query },
    pages: { create, update },
  } as unknown as Client;
  return { notion, query, create, update };
}

/** dataSources.query 的單頁回應：以 syncKey 建既有 row */
function queryPage(keys: Array<{ syncKey: string; pageId: string }>) {
  return {
    results: keys.map((k) => ({
      id: k.pageId,
      properties: {
        [PROP.daily.syncKey]: { rich_text: [{ plain_text: k.syncKey }] },
      },
    })),
    has_more: false,
    next_cursor: null,
  };
}

function makeRow(accountName: string) {
  return buildDailyPerformanceRows(
    [makeRecord({ account_name: accountName })],
    [makeAccount({ accountName })],
    DATES,
  )[0];
}

describe("upsertDailyRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rows 為空：直接回 0/0，不打 API", async () => {
    const { notion, query, create, update } = makeNotion();
    const result = await upsertDailyRows(notion, "ds-1", []);
    expect(result).toEqual({ created: 0, updated: 0 });
    expect(query).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("同步鍵已存在 → update；不存在 → create（upsert 冪等核心）", async () => {
    const { notion, query, create, update } = makeNotion();
    query.mockResolvedValue(
      queryPage([{ syncKey: "2026-07-02::帳戶A", pageId: "page-a" }]),
    );
    create.mockResolvedValue({ id: "page-new" });
    update.mockResolvedValue({ id: "page-a" });

    const rows = [makeRow("帳戶A"), makeRow("帳戶B")];
    const result = await upsertDailyRows(notion, "ds-1", rows);

    expect(result).toEqual({ created: 1, updated: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].page_id).toBe("page-a");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].parent).toEqual({
      type: "data_source_id",
      data_source_id: "ds-1",
    });
    // 查詢用「日期」filter 鎖當日
    expect(query.mock.calls[0][0].filter).toEqual({
      property: PROP.daily.date,
      date: { equals: "2026-07-02" },
    });
  });

  it("單筆失敗：其餘照寫，結尾拋錯（含成功計數）", async () => {
    const { notion, query, create } = makeNotion();
    query.mockResolvedValue(queryPage([]));
    create
      .mockRejectedValueOnce(new Error("Notion 500"))
      .mockResolvedValue({ id: "page-ok" });

    const rows = [makeRow("帳戶A"), makeRow("帳戶B"), makeRow("帳戶C")];
    await expect(upsertDailyRows(notion, "ds-1", rows)).rejects.toThrow(
      "1/3 筆寫入失敗（已成功 建2更新0）",
    );
    expect(create).toHaveBeenCalledTimes(3); // 失敗後仍繼續
  });

  it("查詢分頁：has_more 時跟進 next_cursor", async () => {
    const { notion, query, update } = makeNotion();
    query
      .mockResolvedValueOnce({
        ...queryPage([{ syncKey: "2026-07-02::帳戶A", pageId: "page-a" }]),
        has_more: true,
        next_cursor: "cur-2",
      })
      .mockResolvedValueOnce(queryPage([]));
    update.mockResolvedValue({ id: "page-a" });

    await upsertDailyRows(notion, "ds-1", [makeRow("帳戶A")]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].start_cursor).toBe("cur-2");
  });
});

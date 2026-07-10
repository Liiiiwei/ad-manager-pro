import { describe, it, expect } from "vitest";
import type { BudgetChangeLog, BudgetActionItem } from "@prisma/client";
import {
  makeSyncKey,
  buildDailyRowProperties,
  buildChangeLogProperties,
  buildActionItemProperties,
  buildActionItemSummary,
  accountNameFromChangeLog,
  type DailyPerformanceRow,
} from "../property-builders";
import { PROP } from "../database-schemas";

const SEP = "";

function dailyRow(
  overrides: Partial<DailyPerformanceRow> = {},
): DailyPerformanceRow {
  return {
    date: "2026-07-09",
    accountName: "客戶A-Meta",
    platform: "Meta",
    spend: 1200,
    revenue: 3600,
    conversions: 12,
    roas: 3,
    cpa: 100,
    monthSpend: 25000,
    pacingRatio: 0.93,
    budgetSource: "manual",
    monthlyBudget: 90000,
    syncKey: "2026-07-09::客戶A-Meta",
    ...overrides,
  };
}

function changeLog(overrides: Partial<BudgetChangeLog> = {}): BudgetChangeLog {
  return {
    id: "clog-1",
    userId: "user-1",
    source: "platform_detected",
    scope: "campaign",
    platform: "meta",
    entityKey: `meta${SEP}客戶A${SEP}夏季促購`,
    entityLabel: "夏季促購",
    budgetType: "daily",
    previousValue: 1000,
    newValue: 1500,
    changePercent: 50,
    note: null,
    notionPageId: null,
    detectedAt: new Date("2026-07-08T17:00:00Z"), // 台北 2026-07-09 01:00
    ...overrides,
  };
}

function actionItem(
  overrides: Partial<BudgetActionItem> = {},
): BudgetActionItem {
  return {
    id: "item-1",
    userId: "user-1",
    reason: "pacing_overspend",
    platform: "all",
    accountName: "客戶A-Meta",
    severity: "warning",
    detail: {
      monthSpend: 25000,
      periodBudget: 20000,
      pacingRatio: 1.25,
      monthlyBudget: 90000,
    },
    status: "open",
    resolvedBy: null,
    linkedChangeLogId: null,
    notionPageId: null,
    createdAt: new Date("2026-07-08T17:00:00Z"),
    resolvedAt: null,
    ...overrides,
  };
}

describe("makeSyncKey", () => {
  it("以 :: 串接日期與帳號名", () => {
    expect(makeSyncKey("2026-07-09", "客戶A-Meta")).toBe(
      "2026-07-09::客戶A-Meta",
    );
  });
});

describe("buildDailyRowProperties", () => {
  it("完整列：標題為「日期 帳號」、數字與同步鍵齊全", () => {
    const props = buildDailyRowProperties(dailyRow());
    expect(props[PROP.daily.name]).toEqual({
      title: [{ type: "text", text: { content: "2026-07-09 客戶A-Meta" } }],
    });
    expect(props[PROP.daily.date]).toEqual({ date: { start: "2026-07-09" } });
    expect(props[PROP.daily.spend]).toEqual({ number: 1200 });
    expect(props[PROP.daily.pacing]).toEqual({ number: 0.93 });
    expect(props[PROP.daily.budgetSource]).toEqual({
      select: { name: "手動月預算" },
    });
    expect(props[PROP.daily.syncKey]).toEqual({
      rich_text: [
        { type: "text", text: { content: "2026-07-09::客戶A-Meta" } },
      ],
    });
  });

  it("null 欄位寫空值（number: null），update 時能清掉舊值", () => {
    const props = buildDailyRowProperties(
      dailyRow({
        roas: null,
        cpa: null,
        pacingRatio: null,
        monthlyBudget: null,
      }),
    );
    expect(props[PROP.daily.roas]).toEqual({ number: null });
    expect(props[PROP.daily.cpa]).toEqual({ number: null });
    expect(props[PROP.daily.pacing]).toEqual({ number: null });
    expect(props[PROP.daily.monthlyBudget]).toEqual({ number: null });
  });

  it("budgetSource 對應：api → 平台推算、null → 未設定", () => {
    expect(
      buildDailyRowProperties(dailyRow({ budgetSource: "api" }))[
        PROP.daily.budgetSource
      ],
    ).toEqual({ select: { name: "平台推算" } });
    expect(
      buildDailyRowProperties(dailyRow({ budgetSource: null }))[
        PROP.daily.budgetSource
      ],
    ).toEqual({ select: { name: "未設定" } });
  });
});

describe("accountNameFromChangeLog", () => {
  it("campaign 級從 entityKey 以 U+001F 拆第 2 段", () => {
    expect(
      accountNameFromChangeLog({
        scope: "campaign",
        entityKey: `meta${SEP}客戶A${SEP}夏季促購`,
      }),
    ).toBe("客戶A");
  });

  it("account_monthly 級直接用 entityKey", () => {
    expect(
      accountNameFromChangeLog({
        scope: "account_monthly",
        entityKey: "客戶A-Meta",
      }),
    ).toBe("客戶A-Meta");
  });

  it("campaign 級 entityKey 無分隔符時回退整串（防禦）", () => {
    expect(
      accountNameFromChangeLog({ scope: "campaign", entityKey: "怪鍵" }),
    ).toBe("怪鍵");
  });
});

describe("buildChangeLogProperties", () => {
  it("changePercent 是百分比數值，寫入 Notion percent 前必除以 100", () => {
    const props = buildChangeLogProperties(changeLog({ changePercent: 50 }));
    expect(props[PROP.changelog.changePercent]).toEqual({ number: 0.5 });
  });

  it("changePercent null 留空", () => {
    const props = buildChangeLogProperties(changeLog({ changePercent: null }));
    expect(props[PROP.changelog.changePercent]).toEqual({ number: null });
  });

  it("日期以台北時區換算（UTC 17:00 = 台北隔日）、回顧日 +7 天", () => {
    const props = buildChangeLogProperties(changeLog());
    expect(props[PROP.changelog.date]).toEqual({
      date: { start: "2026-07-09" },
    });
    expect(props[PROP.changelog.reviewDate]).toEqual({
      date: { start: "2026-07-16" },
    });
  });

  it("select 對應：來源/層級/平台/預算類型中文化，標題含千分位", () => {
    const props = buildChangeLogProperties(changeLog());
    expect(props[PROP.changelog.source]).toEqual({
      select: { name: "系統偵測" },
    });
    expect(props[PROP.changelog.level]).toEqual({
      select: { name: "行銷活動" },
    });
    expect(props[PROP.changelog.account]).toEqual({
      select: { name: "客戶A" },
    });
    expect(props[PROP.changelog.platform]).toEqual({
      select: { name: "Meta" },
    });
    expect(props[PROP.changelog.actionType]).toEqual({
      select: { name: "預算調整" },
    });
    expect(props[PROP.changelog.budgetType]).toEqual({
      select: { name: "日預算" },
    });
    expect(props[PROP.changelog.name]).toEqual({
      title: [{ type: "text", text: { content: "夏季促購 預算 1,000→1,500" } }],
    });
  });

  it("previousValue null：改前留空、標題用 —", () => {
    const props = buildChangeLogProperties(
      changeLog({
        source: "manual_account_budget",
        scope: "account_monthly",
        platform: "manual",
        entityKey: "客戶A-Meta",
        entityLabel: "客戶A-Meta",
        budgetType: "monthly_manual",
        previousValue: null,
      }),
    );
    expect(props[PROP.changelog.previousValue]).toEqual({ number: null });
    expect(props[PROP.changelog.name]).toEqual({
      title: [{ type: "text", text: { content: "客戶A-Meta 預算 —→1,500" } }],
    });
    expect(props[PROP.changelog.source]).toEqual({
      select: { name: "手動月預算" },
    });
    expect(props[PROP.changelog.level]).toEqual({ select: { name: "帳號" } });
    expect(props[PROP.changelog.platform]).toEqual({
      select: { name: "手動" },
    });
    expect(props[PROP.changelog.budgetType]).toEqual({
      select: { name: "手動月預算" },
    });
  });

  it("未知 source/scope/platform/budgetType 原樣輸出（向前相容）", () => {
    const props = buildChangeLogProperties(
      changeLog({
        source: "new_source",
        scope: "account_monthly",
        entityKey: "帳號X",
        platform: "tiktok",
        budgetType: "weekly",
      }),
    );
    expect(props[PROP.changelog.source]).toEqual({
      select: { name: "new_source" },
    });
    expect(props[PROP.changelog.platform]).toEqual({
      select: { name: "tiktok" },
    });
    expect(props[PROP.changelog.budgetType]).toEqual({
      select: { name: "weekly" },
    });
  });

  it("投手手動欄（原因假設/預期效果/7天後回顧）不寫入", () => {
    const props = buildChangeLogProperties(changeLog());
    expect(props[PROP.changelog.hypothesis]).toBeUndefined();
    expect(props[PROP.changelog.expectedEffect]).toBeUndefined();
    expect(props[PROP.changelog.review]).toBeUndefined();
    expect(props[PROP.changelog.systemId]).toEqual({
      rich_text: [{ type: "text", text: { content: "clog-1" } }],
    });
  });
});

describe("buildActionItemSummary", () => {
  it("數字千分位、配速取整數 %", () => {
    expect(
      buildActionItemSummary({
        monthSpend: 25000,
        periodBudget: 20000,
        pacingRatio: 1.253,
        monthlyBudget: 90000,
      }),
    ).toBe("本月已花 25,000／期間額度 20,000（配速 125%），月預算 90,000");
  });

  it("detail 非物件或缺鍵時以 — 呈現，不拋錯", () => {
    expect(buildActionItemSummary(null)).toBe(
      "本月已花 —／期間額度 —（配速 —），月預算 —",
    );
    expect(buildActionItemSummary({ monthSpend: "壞值" })).toBe(
      "本月已花 —／期間額度 —（配速 —），月預算 —",
    );
  });
});

describe("buildActionItemProperties", () => {
  it("open 待辦：完成=false、狀態=進行中、解決欄留空", () => {
    const props = buildActionItemProperties(actionItem());
    expect(props[PROP.todo.name]).toEqual({
      title: [{ type: "text", text: { content: "配速超支：客戶A-Meta" } }],
    });
    expect(props[PROP.todo.done]).toEqual({ checkbox: false });
    expect(props[PROP.todo.status]).toEqual({ select: { name: "進行中" } });
    expect(props[PROP.todo.platform]).toEqual({ select: { name: "全平台" } });
    expect(props[PROP.todo.severity]).toEqual({ select: { name: "注意" } });
    expect(props[PROP.todo.reason]).toEqual({ select: { name: "配速超支" } });
    expect(props[PROP.todo.createdDate]).toEqual({
      date: { start: "2026-07-09" },
    });
    expect(props[PROP.todo.resolvedDate]).toEqual({ date: null });
    expect(props[PROP.todo.resolvedBy]).toEqual({ rich_text: [] });
  });

  it("resolved 待辦：完成=true、狀態/解決日/解決方式鏡射", () => {
    const props = buildActionItemProperties(
      actionItem({
        status: "resolved",
        severity: "critical",
        resolvedBy: "auto_detected_change",
        resolvedAt: new Date("2026-07-09T17:00:00Z"), // 台北 07-10
      }),
    );
    expect(props[PROP.todo.done]).toEqual({ checkbox: true });
    expect(props[PROP.todo.status]).toEqual({ select: { name: "已解決" } });
    expect(props[PROP.todo.severity]).toEqual({ select: { name: "嚴重" } });
    expect(props[PROP.todo.resolvedDate]).toEqual({
      date: { start: "2026-07-10" },
    });
    expect(props[PROP.todo.resolvedBy]).toEqual({
      rich_text: [{ type: "text", text: { content: "系統偵測到預算已調整" } }],
    });
  });

  it("dismissed 待辦：完成=true、狀態=已忽略", () => {
    const props = buildActionItemProperties(
      actionItem({ status: "dismissed" }),
    );
    expect(props[PROP.todo.done]).toEqual({ checkbox: true });
    expect(props[PROP.todo.status]).toEqual({ select: { name: "已忽略" } });
  });

  it("未知 reason/resolvedBy 原樣輸出（向前相容其他功能的新值）", () => {
    const props = buildActionItemProperties(
      actionItem({
        reason: "creative_fatigue",
        status: "resolved",
        resolvedBy: "pacing_recovered",
      }),
    );
    expect(props[PROP.todo.name]).toEqual({
      title: [
        { type: "text", text: { content: "creative_fatigue：客戶A-Meta" } },
      ],
    });
    expect(props[PROP.todo.reason]).toEqual({
      select: { name: "creative_fatigue" },
    });
    expect(props[PROP.todo.resolvedBy]).toEqual({
      rich_text: [{ type: "text", text: { content: "pacing_recovered" } }],
    });
  });

  it("備註是投手手動欄，app 永不寫入", () => {
    const props = buildActionItemProperties(actionItem());
    expect(props[PROP.todo.note]).toBeUndefined();
    expect(props[PROP.todo.systemId]).toEqual({
      rich_text: [{ type: "text", text: { content: "item-1" } }],
    });
  });
});

import type { CreatePageParameters } from "@notionhq/client";
import type { BudgetChangeLog, BudgetActionItem } from "@prisma/client";
import { taipeiDateString } from "@/lib/digest/build-daily-summary";
import { PROP } from "./database-schemas";

/** Notion page properties 物件（pages.create / pages.update 共用同一 union 形狀） */
export type NotionPageProperties = NonNullable<
  CreatePageParameters["properties"]
>;

/** 每日成效 DB 的一列（T3 的 daily-rows.ts 聚合產出後餵進 buildDailyRowProperties） */
export interface DailyPerformanceRow {
  date: string; // 昨日 YYYY-MM-DD（台北）
  accountName: string;
  platform: string; // Meta / Google / 其他（沿用 AccountSummary.platform 顯示名）
  spend: number; // 昨日
  revenue: number; // 昨日
  conversions: number; // 昨日
  roas: number | null; // 花費 0 → null
  cpa: number | null; // 轉換 0 → null
  monthSpend: number; // AccountSummary.spend
  pacingRatio: number | null; // AccountSummary.progress；hasBudget=false → null
  budgetSource: "manual" | "api" | null;
  monthlyBudget: number | null;
  syncKey: string; // `${date}::${accountName}`
}

/** 每日成效 upsert 唯一鍵（§3.1）。分隔符 :: 因為此值會顯示在 Notion 給人看 */
export function makeSyncKey(date: string, accountName: string): string {
  return `${date}::${accountName}`;
}

/** entityKey 的複合鍵分隔字元（Unit Separator，比照 src/lib/budget/snapshot.ts） */
const ENTITY_KEY_SEP = "";

/** 千分位格式化（顯示用，最多 2 位小數） */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---------- 單型別 property 值的小工具（null 一律寫空值，update 時才能清掉舊值） ----------

function title(content: string): NotionPageProperties[string] {
  return { title: [{ type: "text", text: { content } }] };
}

function richText(content: string | null): NotionPageProperties[string] {
  return {
    rich_text: content ? [{ type: "text", text: { content } }] : [],
  };
}

function number(value: number | null): NotionPageProperties[string] {
  return { number: value };
}

function select(name: string): NotionPageProperties[string] {
  return { select: { name } };
}

function date(value: string | null): NotionPageProperties[string] {
  return { date: value ? { start: value } : null };
}

function checkbox(value: boolean): NotionPageProperties[string] {
  return { checkbox: value };
}

// ---------- 每日成效 ----------

const BUDGET_SOURCE_LABELS: Record<string, string> = {
  manual: "手動月預算",
  api: "平台推算",
};

/** DailyPerformanceRow → 每日成效 DB 的 properties（create 與 update 共用，覆寫全部 app 欄位） */
export function buildDailyRowProperties(
  row: DailyPerformanceRow,
): NotionPageProperties {
  return {
    [PROP.daily.name]: title(`${row.date} ${row.accountName}`),
    [PROP.daily.date]: date(row.date),
    [PROP.daily.account]: select(row.accountName),
    [PROP.daily.platform]: select(row.platform),
    [PROP.daily.spend]: number(row.spend),
    [PROP.daily.revenue]: number(row.revenue),
    [PROP.daily.conversions]: number(row.conversions),
    [PROP.daily.roas]: number(row.roas),
    [PROP.daily.cpa]: number(row.cpa),
    [PROP.daily.monthSpend]: number(row.monthSpend),
    [PROP.daily.pacing]: number(row.pacingRatio),
    [PROP.daily.monthlyBudget]: number(row.monthlyBudget),
    [PROP.daily.budgetSource]: select(
      (row.budgetSource && BUDGET_SOURCE_LABELS[row.budgetSource]) || "未設定",
    ),
    [PROP.daily.syncKey]: richText(row.syncKey),
  };
}

// ---------- 操作日誌 ----------

const SOURCE_LABELS: Record<string, string> = {
  platform_detected: "系統偵測",
  manual_account_budget: "手動月預算",
};

const SCOPE_LABELS: Record<string, string> = {
  account_monthly: "帳號",
  campaign: "行銷活動",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  manual: "手動",
};

const BUDGET_TYPE_LABELS: Record<string, string> = {
  daily: "日預算",
  lifetime: "總預算",
  monthly_manual: "手動月預算",
};

/** 從 changelog 取帳號名：campaign 級 entityKey 是「平台␟帳戶名␟campaign 名」，取第 2 段 */
export function accountNameFromChangeLog(log: {
  scope: string;
  entityKey: string;
}): string {
  if (log.scope === "campaign") {
    return log.entityKey.split(ENTITY_KEY_SEP)[1] ?? log.entityKey;
  }
  return log.entityKey; // account_monthly 級 entityKey 即帳號名
}

/**
 * BudgetChangeLog → 操作日誌 DB 的 properties。
 * app 對操作日誌只 create、永不 update——投手手動欄（原因假設/預期效果/7天後回顧）不寫入，
 * 建頁時留空由人補。
 */
export function buildChangeLogProperties(
  log: BudgetChangeLog,
): NotionPageProperties {
  const detectedDate = taipeiDateString(log.detectedAt);
  const reviewDate = taipeiDateString(
    new Date(log.detectedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
  const before =
    log.previousValue != null ? formatNumber(log.previousValue) : "—";
  return {
    [PROP.changelog.name]: title(
      `${log.entityLabel} 預算 ${before}→${formatNumber(log.newValue)}`,
    ),
    [PROP.changelog.date]: date(detectedDate),
    [PROP.changelog.source]: select(SOURCE_LABELS[log.source] ?? log.source),
    [PROP.changelog.level]: select(SCOPE_LABELS[log.scope] ?? log.scope),
    [PROP.changelog.account]: select(accountNameFromChangeLog(log)),
    [PROP.changelog.platform]: select(
      PLATFORM_LABELS[log.platform] ?? log.platform,
    ),
    [PROP.changelog.actionType]: select("預算調整"),
    [PROP.changelog.budgetType]: select(
      BUDGET_TYPE_LABELS[log.budgetType] ?? log.budgetType,
    ),
    [PROP.changelog.previousValue]: number(log.previousValue),
    [PROP.changelog.newValue]: number(log.newValue),
    // DB 存百分比數值（25 = 25%），Notion percent 格式吃 0~1 → 除以 100
    [PROP.changelog.changePercent]: number(
      log.changePercent != null ? log.changePercent / 100 : null,
    ),
    [PROP.changelog.reviewDate]: date(reviewDate),
    [PROP.changelog.systemId]: richText(log.id),
  };
}

// ---------- 待辦事項 ----------

const REASON_LABELS: Record<string, string> = {
  pacing_overspend: "配速超支",
};

const STATUS_LABELS: Record<string, string> = {
  open: "進行中",
  resolved: "已解決",
  dismissed: "已忽略",
};

const TODO_PLATFORM_LABELS: Record<string, string> = {
  all: "全平台",
  meta: "Meta",
  google: "Google",
};

const RESOLVED_BY_LABELS: Record<string, string> = {
  auto_detected_change: "系統偵測到預算已調整",
  manual: "手動",
  notion_checkbox: "Notion 勾選完成",
};

/** detail 是未驗證 JSON，比照 action-items.ts asDetailObject 的淨化態度 */
function detailNumber(detail: unknown, key: string): number | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail))
    return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** detail JSON → 摘要字串（數字千分位、配速取整數 %；缺值以 — 呈現） */
export function buildActionItemSummary(detail: unknown): string {
  const monthSpend = detailNumber(detail, "monthSpend");
  const periodBudget = detailNumber(detail, "periodBudget");
  const pacingRatio = detailNumber(detail, "pacingRatio");
  const monthlyBudget = detailNumber(detail, "monthlyBudget");
  const fmt = (n: number | null) => (n != null ? formatNumber(n) : "—");
  const pacing =
    pacingRatio != null ? `${Math.round(pacingRatio * 100)}%` : "—";
  return `本月已花 ${fmt(monthSpend)}／期間額度 ${fmt(periodBudget)}（配速 ${pacing}），月預算 ${fmt(monthlyBudget)}`;
}

/**
 * BudgetActionItem → 待辦事項 DB 的 properties（create 與 update 共用）。
 * 「備註」是投手手動欄，app 永不寫入。
 * 未知 reason/resolvedBy 原樣輸出（向前相容其他功能新增的值）。
 */
export function buildActionItemProperties(
  item: BudgetActionItem,
): NotionPageProperties {
  const reasonLabel = REASON_LABELS[item.reason] ?? item.reason;
  return {
    [PROP.todo.name]: title(`${reasonLabel}：${item.accountName}`),
    // 讀回鍵：人勾 true 且 app 端仍 open → 標 resolved
    [PROP.todo.done]: checkbox(item.status !== "open"),
    [PROP.todo.status]: select(STATUS_LABELS[item.status] ?? item.status),
    [PROP.todo.account]: select(item.accountName),
    [PROP.todo.platform]: select(
      TODO_PLATFORM_LABELS[item.platform] ?? item.platform,
    ),
    [PROP.todo.severity]: select(
      item.severity === "critical" ? "嚴重" : "注意",
    ),
    [PROP.todo.reason]: select(reasonLabel),
    [PROP.todo.summary]: richText(buildActionItemSummary(item.detail)),
    [PROP.todo.createdDate]: date(taipeiDateString(item.createdAt)),
    [PROP.todo.resolvedDate]: date(
      item.resolvedAt ? taipeiDateString(item.resolvedAt) : null,
    ),
    [PROP.todo.resolvedBy]: richText(
      item.resolvedBy
        ? (RESOLVED_BY_LABELS[item.resolvedBy] ?? item.resolvedBy)
        : null,
    ),
    [PROP.todo.systemId]: richText(item.id),
  };
}

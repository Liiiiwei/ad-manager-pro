import type { CreateDataSourceParameters } from "@notionhq/client";

/** Notion data source 的 properties 定義型別（databases.create 的 initial_data_source.properties 同型） */
export type NotionDataSourceProperties =
  CreateDataSourceParameters["properties"];

/** 三個 database 的標題 */
export const DB_TITLES = {
  daily: "每日成效",
  changelog: "操作日誌",
  todo: "待辦事項",
} as const;

/**
 * Property 名稱常數——所有讀寫 Notion 欄位的程式（含 T3 管線）一律引用此物件，
 * 禁止手寫欄位名字串，改名只改這裡。
 */
export const PROP = {
  daily: {
    name: "名稱",
    date: "日期",
    account: "帳號",
    platform: "平台",
    spend: "花費",
    revenue: "營收",
    conversions: "轉換數",
    roas: "ROAS",
    cpa: "CPA",
    monthSpend: "本月累計花費",
    pacing: "配速",
    monthlyBudget: "月預算",
    budgetSource: "預算來源",
    syncKey: "同步鍵",
  },
  changelog: {
    name: "名稱",
    date: "日期",
    source: "來源",
    level: "層級",
    account: "帳號",
    platform: "平台",
    actionType: "操作類型",
    budgetType: "預算類型",
    previousValue: "改前",
    newValue: "改後",
    changePercent: "變化幅度",
    hypothesis: "原因假設",
    expectedEffect: "預期效果",
    review: "7天後回顧",
    reviewDate: "回顧日",
    systemId: "系統ID",
  },
  todo: {
    name: "名稱",
    done: "完成",
    status: "狀態",
    account: "帳號",
    platform: "平台",
    severity: "嚴重度",
    reason: "原因",
    summary: "摘要",
    createdDate: "建立日",
    resolvedDate: "解決日",
    resolvedBy: "解決方式",
    note: "備註",
    systemId: "系統ID",
  },
} as const;

/**
 * 每日成效 DB 欄位定義。
 * 百分比欄寫入 0~1 比值（format percent 顯示成 %）；金額欄 format "number"（多幣別混表，不指定貨幣）。
 */
export const DAILY_DB_PROPERTIES: NotionDataSourceProperties = {
  [PROP.daily.name]: { type: "title", title: {} },
  [PROP.daily.date]: { type: "date", date: {} },
  // 帳號用 select：數量有限、可篩選分組；API 寫入未見過的 option 會自動新增，不預建
  [PROP.daily.account]: { type: "select", select: {} },
  [PROP.daily.platform]: {
    type: "select",
    select: {
      options: [
        { name: "Meta", color: "blue" },
        { name: "Google", color: "green" },
        { name: "其他", color: "gray" },
      ],
    },
  },
  [PROP.daily.spend]: { type: "number", number: { format: "number" } },
  [PROP.daily.revenue]: { type: "number", number: { format: "number" } },
  [PROP.daily.conversions]: { type: "number", number: { format: "number" } },
  [PROP.daily.roas]: { type: "number", number: { format: "number" } },
  [PROP.daily.cpa]: { type: "number", number: { format: "number" } },
  [PROP.daily.monthSpend]: { type: "number", number: { format: "number" } },
  [PROP.daily.pacing]: { type: "number", number: { format: "percent" } },
  [PROP.daily.monthlyBudget]: { type: "number", number: { format: "number" } },
  [PROP.daily.budgetSource]: {
    type: "select",
    select: {
      options: [
        { name: "手動月預算" },
        { name: "平台推算" },
        { name: "未設定", color: "gray" },
      ],
    },
  },
  // upsert 唯一鍵：`{日期}::{帳號名}`（人可讀，所以不用 U+001F）
  [PROP.daily.syncKey]: { type: "rich_text", rich_text: {} },
};

/**
 * 操作日誌 DB 欄位定義。
 * app 對此 DB 只 create、永不 update——「原因假設／預期效果／7天後回顧」是投手手動欄，不會被覆寫。
 */
export const CHANGELOG_DB_PROPERTIES: NotionDataSourceProperties = {
  [PROP.changelog.name]: { type: "title", title: {} },
  [PROP.changelog.date]: { type: "date", date: {} },
  [PROP.changelog.source]: {
    type: "select",
    select: {
      options: [
        { name: "系統偵測", color: "blue" },
        { name: "手動月預算", color: "purple" },
        // 純手動列專用，app 不會寫此值
        { name: "投手補記", color: "orange" },
      ],
    },
  },
  [PROP.changelog.level]: {
    type: "select",
    select: {
      options: [{ name: "帳號" }, { name: "行銷活動" }],
    },
  },
  [PROP.changelog.account]: { type: "select", select: {} },
  [PROP.changelog.platform]: {
    type: "select",
    select: {
      options: [
        { name: "Meta", color: "blue" },
        { name: "Google", color: "green" },
        { name: "手動", color: "gray" },
      ],
    },
  },
  [PROP.changelog.actionType]: {
    type: "select",
    select: {
      options: [
        // 自動列一律「預算調整」；其餘預建給投手手動補記用
        { name: "預算調整" },
        { name: "出價調整" },
        { name: "素材更換" },
        { name: "受眾調整" },
        { name: "開關活動" },
        { name: "其他" },
      ],
    },
  },
  [PROP.changelog.budgetType]: {
    type: "select",
    select: {
      options: [{ name: "日預算" }, { name: "總預算" }, { name: "手動月預算" }],
    },
  },
  [PROP.changelog.previousValue]: {
    type: "number",
    number: { format: "number" },
  },
  [PROP.changelog.newValue]: { type: "number", number: { format: "number" } },
  // DB 存百分比數值（如 25 = 25%），Notion percent 格式吃 0~1 → 寫入時必除以 100
  [PROP.changelog.changePercent]: {
    type: "number",
    number: { format: "percent" },
  },
  [PROP.changelog.hypothesis]: { type: "rich_text", rich_text: {} },
  [PROP.changelog.expectedEffect]: { type: "rich_text", rich_text: {} },
  [PROP.changelog.review]: { type: "rich_text", rich_text: {} },
  [PROP.changelog.reviewDate]: { type: "date", date: {} },
  [PROP.changelog.systemId]: { type: "rich_text", rich_text: {} },
};

/**
 * 待辦事項 DB 欄位定義。
 * 「完成」checkbox 是人唯一要操作的欄（讀回鍵）；「狀態」select 由 app 鏡射三態，人不用動。
 */
export const TODO_DB_PROPERTIES: NotionDataSourceProperties = {
  [PROP.todo.name]: { type: "title", title: {} },
  [PROP.todo.done]: { type: "checkbox", checkbox: {} },
  [PROP.todo.status]: {
    type: "select",
    select: {
      options: [
        { name: "進行中", color: "blue" },
        { name: "已解決", color: "green" },
        { name: "已忽略", color: "gray" },
      ],
    },
  },
  [PROP.todo.account]: { type: "select", select: {} },
  [PROP.todo.platform]: {
    type: "select",
    select: {
      options: [
        { name: "全平台", color: "purple" },
        { name: "Meta", color: "blue" },
        { name: "Google", color: "green" },
      ],
    },
  },
  [PROP.todo.severity]: {
    type: "select",
    select: {
      options: [
        { name: "注意", color: "yellow" },
        { name: "嚴重", color: "red" },
      ],
    },
  },
  [PROP.todo.reason]: {
    type: "select",
    select: {
      // 其他 reason 寫入時自動建 option（向前相容新 reason）
      options: [{ name: "配速超支" }],
    },
  },
  [PROP.todo.summary]: { type: "rich_text", rich_text: {} },
  [PROP.todo.createdDate]: { type: "date", date: {} },
  [PROP.todo.resolvedDate]: { type: "date", date: {} },
  [PROP.todo.resolvedBy]: { type: "rich_text", rich_text: {} },
  // 投手手動欄：app 永不寫入
  [PROP.todo.note]: { type: "rich_text", rich_text: {} },
  [PROP.todo.systemId]: { type: "rich_text", rich_text: {} },
};

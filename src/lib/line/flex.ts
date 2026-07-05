import type { DailySummary } from "@/lib/digest/build-daily-summary";
import type { TriggeredAlert } from "@/lib/alerts/types";
import { pacingLevel, type PacingLevel } from "@/lib/initiatives/pacing";
import { formatCurrency, formatRoas } from "@/lib/utils/format";
// 週報專用（分帳號 Top-N 切分）；日報不使用
import { splitTopAccounts } from "@/lib/digest/build-weekly-summary";

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
  budgetActionItemCount = 0,
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
    kvRow(
      "預算待辦",
      `${budgetActionItemCount} 筆`,
      budgetActionItemCount > 0 ? COLORS.danger : COLORS.success,
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
          text: "LINE 推播設定成功！之後每天中午 12:00 會收到前一日廣告摘要。",
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
    summary.yesterdayCpa !== null ? formatCurrency(summary.yesterdayCpa) : "—";
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

// ==================== 叮咚週報（純追加，上方既有函式與 private helper 一字不動）====================
// 說明：週報 builder 放進本檔是為了複用 module-private 的 header / kvRow / footerButton；
// WeeklySummary 以 inline import type 引用，避免更動檔案最上方的既有 import 區塊。

type WeeklySummaryType =
  import("@/lib/digest/build-weekly-summary").WeeklySummary;
type AccountWeeklyType =
  import("@/lib/digest/build-weekly-summary").AccountWeekly;

/** 平台圓點顏色（僅視覺區分，非好壞判斷） */
const PLATFORM_HEX: Record<string, string> = {
  Meta: COLORS.info,
  Google: COLORS.warning,
};
function platformHex(platform: string): string {
  return PLATFORM_HEX[platform] ?? COLORS.muted;
}

/** Flex 卡片最多完整渲染的帳號數；其餘收成一列彙總（純文字備援不受此限） */
const WEEKLY_FLEX_MAX_ACCOUNTS = 5;

/** WoW 百分比格式化：null → 「—」，正值補「+」 */
function formatWow(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * WoW 顏色：依指標語意判好壞。
 * higherIsBetter=true（ROAS、轉換）→ 上升為佳（綠）；false（CPA）→ 下降為佳。
 * 0 或 null → 灰。花費不判好壞（呼叫端傳 muted）。
 */
function wowColor(pct: number | null, higherIsBetter: boolean): string {
  if (pct === null || pct === 0) return COLORS.muted;
  const good = higherIsBetter ? pct > 0 : pct < 0;
  return good ? COLORS.success : COLORS.danger;
}

/** 值 + WoW 的顯示字串，例如「NT$1,000（+25.0%）」 */
function withWow(valueStr: string, pct: number | null): string {
  return `${valueStr}（${formatWow(pct)}）`;
}

/**
 * 週配速進度條（僅在有預算時呼叫）。
 * 規則：>100% 轉紅（danger），否則靛（accent）；條寬夾在 1%～100%（LINE 不接受 0%）。
 */
function weeklyProgressBar(progress: number): FlexNode {
  const pct = Math.round(progress * 100);
  const barWidth = Math.max(1, Math.min(pct, 100));
  const color = progress > 1 ? COLORS.danger : COLORS.accent;
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: COLORS.track,
    cornerRadius: "sm",
    height: "6px",
    margin: "sm",
    contents: [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: color,
        cornerRadius: "sm",
        height: "6px",
        width: `${barWidth}%`,
        contents: [{ type: "filler" }],
      },
    ],
  };
}

/** 單一帳號的 Flex 區塊（平台圓點＋帳號名 → 花費WoW → 配速條 → ROAS/轉換 → CPA WoW） */
function accountSection(account: AccountWeeklyType): FlexNode[] {
  const roasStr = account.roas !== null ? formatRoas(account.roas) : "—";
  const cpaStr = account.cpa !== null ? formatCurrency(account.cpa) : "—";

  const rows: FlexNode[] = [
    { type: "separator", margin: "lg" },
    // 平台圓點 + 帳號名
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "10px",
          height: "10px",
          cornerRadius: "5px",
          backgroundColor: platformHex(account.platform),
          flex: 0,
          contents: [{ type: "filler" }],
        },
        {
          type: "text",
          text: safeText(account.accountName),
          size: "sm",
          weight: "bold",
          color: COLORS.foreground,
          margin: "sm",
          flex: 1,
          wrap: true,
        },
      ],
    },
    // 花費不判好壞，維持前景色
    kvRow(
      "花費",
      withWow(formatCurrency(account.thisWeekSpend), account.spendWow),
      COLORS.foreground,
    ),
  ];

  // 週配速：有預算畫進度條，無預算顯示「未設定預算」不畫條
  if (account.weekProgress !== null) {
    const pct = Math.round(account.weekProgress * 100);
    const color = account.weekProgress > 1 ? COLORS.danger : COLORS.accent;
    rows.push(kvRow("週配速", `${pct}%`, color));
    rows.push(weeklyProgressBar(account.weekProgress));
  } else {
    rows.push(kvRow("週配速", "未設定預算", COLORS.muted));
  }

  rows.push(
    kvRow("ROAS｜轉換", `${roasStr}｜${Math.round(account.conversions)}`),
    kvRow(
      "CPA",
      withWow(cpaStr, account.cpaWow),
      wowColor(account.cpaWow, false),
    ),
  );

  return rows;
}

/** 每週週報 Flex bubble（分帳號完整版） */
export function buildWeeklyFlex(
  summary: WeeklySummaryType,
  appUrl: string,
): Record<string, unknown> {
  const { thisWeek, wow, accounts } = summary;

  const bodyContents: FlexNode[] = [
    { type: "text", text: "本週總花費", size: "xs", color: COLORS.muted },
    {
      type: "text",
      text: safeText(formatCurrency(thisWeek.spend)),
      size: "xxl",
      weight: "bold",
      color: COLORS.foreground,
      margin: "xs",
    },
    // 總花費 WoW（不判好壞，維持前景色）
    kvRow(
      "對上週",
      formatWow(wow.spendPct),
      wow.spendPct === null ? COLORS.muted : COLORS.foreground,
    ),
  ];

  if (accounts.length > 0) {
    // 帳號數多時只完整渲染前 N 個，其餘收成一列彙總避免 Flex 卡片過長
    const { shown, restCount, restSpend } = splitTopAccounts(
      accounts,
      WEEKLY_FLEX_MAX_ACCOUNTS,
    );
    for (const account of shown) {
      bodyContents.push(...accountSection(account));
    }
    if (restCount > 0) {
      bodyContents.push(
        { type: "separator", margin: "lg" },
        kvRow(
          `其餘 ${restCount} 個帳號`,
          formatCurrency(restSpend),
          COLORS.muted,
        ),
      );
    }
  } else {
    bodyContents.push(
      { type: "separator", margin: "lg" },
      {
        type: "text",
        text: "本週無帳號資料",
        size: "sm",
        color: COLORS.muted,
        margin: "md",
        wrap: true,
      },
    );
  }

  return {
    type: "bubble",
    header: header(
      "每週廣告週報",
      `${summary.weekStart} ~ ${summary.weekEnd}`,
      COLORS.accent,
    ),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents,
    },
    // 週報專屬頁尚未建立，暫連每日摘要頁（/weekly 建好後改連）
    footer: footerButton("查看完整分析", `${appUrl}/daily`),
  };
}

/** 每週週報純文字備援（Flex 組裝失敗時使用，分帳號逐一列出） */
export function buildWeeklyText(
  summary: WeeklySummaryType,
  appUrl: string,
): string {
  const { thisWeek, wow, accounts } = summary;

  const lines: string[] = [
    `每週廣告週報（${summary.weekStart} ~ ${summary.weekEnd}）`,
    `本週總花費：${formatCurrency(thisWeek.spend)}（${formatWow(wow.spendPct)}）`,
  ];

  if (accounts.length === 0) {
    lines.push("本週無帳號資料");
  } else {
    for (const account of accounts) {
      const roasStr = account.roas !== null ? formatRoas(account.roas) : "—";
      const cpaStr = account.cpa !== null ? formatCurrency(account.cpa) : "—";
      const pace =
        account.weekProgress !== null
          ? `${Math.round(account.weekProgress * 100)}%`
          : "未設定預算";
      lines.push(
        "",
        `【${account.accountName}｜${account.platform}】`,
        `花費：${formatCurrency(account.thisWeekSpend)}（${formatWow(account.spendWow)}）`,
        `週配速：${pace}`,
        `ROAS：${roasStr}｜轉換：${Math.round(account.conversions)}`,
        `CPA：${cpaStr}（${formatWow(account.cpaWow)}）`,
      );
    }
  }

  lines.push("", `${appUrl}/daily`);
  return lines.join("\n");
}

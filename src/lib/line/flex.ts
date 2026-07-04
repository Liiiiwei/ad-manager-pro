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

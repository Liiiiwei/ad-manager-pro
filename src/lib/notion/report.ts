import type { AnalysisResult, Alert } from "@/lib/analysis/types";
import { formatCurrency, formatRoas, formatCtr } from "@/lib/utils/format";

/** 產生 Notion 每日報告的 Markdown 內容 */
export function buildDailyReportContent(analysis: AnalysisResult): string {
  const { summary, alerts, platformBreakdown, dateRange } = analysis;

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const warningAlerts = alerts.filter((a) => a.severity === "warning");
  const infoAlerts = alerts.filter((a) => a.severity === "info");

  const sections: string[] = [];

  // 總覽
  sections.push(`## 總覽

| 指標 | 數值 |
|------|------|
| 總花費 | ${formatCurrency(summary.totalSpend)} |
| 總營收 | ${formatCurrency(summary.totalRevenue)} |
| ROAS | ${formatRoas(summary.overallRoas)} |
| 轉換數 | ${Math.round(summary.totalConversions)} |
| 平均 CPC | ${formatCurrency(summary.avgCpc)} |
| 平均 CTR | ${formatCtr(summary.avgCtr)} |`);

  // 平台比較
  sections.push(`## 平台表現比較

| 指標 | Meta | Google |
|------|------|--------|
| 花費 | ${formatCurrency(platformBreakdown.meta.spend)} | ${formatCurrency(platformBreakdown.google.spend)} |
| 營收 | ${formatCurrency(platformBreakdown.meta.revenue)} | ${formatCurrency(platformBreakdown.google.revenue)} |
| ROAS | ${formatRoas(platformBreakdown.meta.roas)} | ${formatRoas(platformBreakdown.google.roas)} |
| 轉換 | ${Math.round(platformBreakdown.meta.conversions)} | ${Math.round(platformBreakdown.google.conversions)} |
| CPC | ${formatCurrency(platformBreakdown.meta.cpc)} | ${formatCurrency(platformBreakdown.google.cpc)} |
| CTR | ${formatCtr(platformBreakdown.meta.ctr)} | ${formatCtr(platformBreakdown.google.ctr)} |`);

  // 嚴重警示
  if (criticalAlerts.length > 0) {
    sections.push(`## 需立即處理 (${criticalAlerts.length})

${criticalAlerts.map(formatAlertItem).join("\n\n")}`);
  }

  // 警告
  if (warningAlerts.length > 0) {
    sections.push(`## 需關注 (${warningAlerts.length})

${warningAlerts.map(formatAlertItem).join("\n\n")}`);
  }

  // 建議
  if (infoAlerts.length > 0) {
    sections.push(`## 建議行動 (${infoAlerts.length})

${infoAlerts.map(formatAlertItem).join("\n\n")}`);
  }

  if (alerts.length === 0) {
    sections.push(`## 警示

目前沒有異常警示，一切正常運作中。`);
  }

  // 頁尾
  sections.push(`---

*報告產生時間: ${analysis.generatedAt}*
*資料範圍: ${dateRange.from} ~ ${dateRange.to}*`);

  return sections.join("\n\n");
}

function formatAlertItem(alert: Alert): string {
  const platformLabel =
    alert.platform === "meta" ? "Meta" : alert.platform === "google" ? "Google" : "全平台";

  return `**${alert.title}** (${platformLabel})
> ${alert.description}
> **建議**: ${alert.recommendation}`;
}

/** 產生報告標題 */
export function buildReportTitle(dateRange: { from: string; to: string }): string {
  return `${dateRange.from} ~ ${dateRange.to} 廣告最佳化報告`;
}

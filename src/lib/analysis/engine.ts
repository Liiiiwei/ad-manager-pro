import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert, AnalysisResult, AnalysisThresholds, PlatformMetrics } from "./types";
import { detectBudgetAnomalies } from "./budget-anomaly";
import { detectPerformanceDecline } from "./performance";
import { detectCreativeFatigue } from "./creative-fatigue";
import { generateRecommendations } from "./recommendations";
import { DEFAULT_THRESHOLDS } from "./thresholds";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** 執行完整分析 */
export function runFullAnalysis(
  data: WindsorAdRecord[],
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): AnalysisResult {
  // 計算 summary
  const summary = calculateSummary(data);

  // 執行四個分析模組
  const budgetAlerts = detectBudgetAnomalies(data, thresholds.budget);
  const performanceAlerts = detectPerformanceDecline(data, thresholds.performance);
  const creativeAlerts = detectCreativeFatigue(data, thresholds.creative);
  const recommendations = generateRecommendations(data, thresholds.recommendation);

  // 合併並排序（critical 優先）
  const alerts = [
    ...budgetAlerts,
    ...performanceAlerts,
    ...creativeAlerts,
    ...recommendations,
  ].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  });

  // 計算平台拆分
  const platformBreakdown = calculatePlatformBreakdown(data);

  // 計算日期範圍
  const dates = data.map((r) => r.date).sort();
  const dateRange = {
    from: dates[0] || "",
    to: dates[dates.length - 1] || "",
  };

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    summary,
    alerts,
    platformBreakdown,
  };
}

function calculateSummary(data: WindsorAdRecord[]) {
  const totalSpend = data.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0);
  const totalClicks = data.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = data.reduce((s, r) => s + r.impressions, 0);
  const totalConversions = data.reduce((s, r) => s + r.conversions, 0);

  return {
    totalSpend,
    totalRevenue,
    overallRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    totalConversions,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
  };
}

function calculatePlatformBreakdown(
  data: WindsorAdRecord[],
): { meta: PlatformMetrics; google: PlatformMetrics } {
  const metaData = data.filter(
    (r) => r.source.includes("facebook") || r.source.includes("instagram"),
  );
  const googleData = data.filter((r) => r.source.includes("google"));

  return {
    meta: calculatePlatformMetrics(metaData),
    google: calculatePlatformMetrics(googleData),
  };
}

function calculatePlatformMetrics(data: WindsorAdRecord[]): PlatformMetrics {
  const spend = data.reduce((s, r) => s + r.spend, 0);
  const revenue = data.reduce((s, r) => s + r.revenue, 0);
  const clicks = data.reduce((s, r) => s + r.clicks, 0);
  const impressions = data.reduce((s, r) => s + r.impressions, 0);
  const conversions = data.reduce((s, r) => s + r.conversions, 0);

  return {
    spend,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    conversions,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    aov: conversions > 0 ? revenue / conversions : 0,
  };
}

import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert, AnalysisThresholds } from "./types";
import { average, percentChange, generateId } from "@/lib/utils/math";

/**
 * 預算與花費異常偵測
 * 策略：比較近 7 天每日花費的移動平均值與當日花費
 */
export function detectBudgetAnomalies(
  data: WindsorAdRecord[],
  thresholds: AnalysisThresholds["budget"],
): Alert[] {
  const alerts: Alert[] = [];

  // 依 campaign 分組
  const campaignMap = groupByCampaign(data);

  for (const [campaignName, records] of Object.entries(campaignMap)) {
    // 依日期排序
    const sorted = records.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    if (sorted.length < 2) continue;

    const platform = toPlatform(sorted[0].source);
    const accountName = sorted[0].account_name;
    const latest = sorted[sorted.length - 1];
    const previousDays = sorted.slice(0, -1).slice(-7);

    if (previousDays.length === 0) continue;

    // CPC 暴漲
    const avgCpc = average(previousDays.map((r) => r.cpc));
    if (avgCpc > 0 && latest.cpc > 0) {
      const cpcChange = percentChange(latest.cpc, avgCpc);
      if (cpcChange > thresholds.cpcSpikePercent) {
        alerts.push({
          id: generateId(),
          category: "budget",
          severity: "warning",
          title: `${campaignName} CPC 暴漲`,
          description: `CPC 從 $${avgCpc.toFixed(2)} 升至 $${latest.cpc.toFixed(2)}，漲幅 ${cpcChange.toFixed(1)}%`,
          metric: "cpc",
          currentValue: latest.cpc,
          previousValue: avgCpc,
          changePercent: cpcChange,
          platform,
          accountName,
          campaignName,
          detectedAt: latest.date,
          recommendation: "檢查受眾競爭度、調整出價策略或更新廣告素材",
        });
      }
    }

    // CPM 暴漲
    const avgCpm = average(previousDays.map((r) => r.cpm));
    if (avgCpm > 0 && latest.cpm > 0) {
      const cpmChange = percentChange(latest.cpm, avgCpm);
      if (cpmChange > thresholds.cpmSpikePercent) {
        alerts.push({
          id: generateId(),
          category: "budget",
          severity: "info",
          title: `${campaignName} CPM 上升`,
          description: `CPM 從 $${avgCpm.toFixed(2)} 升至 $${latest.cpm.toFixed(2)}，漲幅 ${cpmChange.toFixed(1)}%`,
          metric: "cpm",
          currentValue: latest.cpm,
          previousValue: avgCpm,
          changePercent: cpmChange,
          platform,
          accountName,
          campaignName,
          detectedAt: latest.date,
          recommendation: "可能是競爭加劇或受眾飽和，考慮調整目標受眾",
        });
      }
    }
  }

  return alerts;
}

function groupByCampaign(
  data: WindsorAdRecord[],
): Record<string, WindsorAdRecord[]> {
  const map: Record<string, WindsorAdRecord[]> = {};
  for (const record of data) {
    const key = record.campaign || "unknown";
    if (!map[key]) map[key] = [];
    map[key].push(record);
  }
  return map;
}

function toPlatform(source: string): "meta" | "google" | "all" {
  if (source.includes("facebook") || source.includes("instagram"))
    return "meta";
  if (source.includes("google")) return "google";
  return "all";
}

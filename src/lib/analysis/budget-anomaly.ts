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

    // 花費異常
    const avgSpend = average(previousDays.map((r) => r.spend));
    if (avgSpend > 0) {
      const spendChange = percentChange(latest.spend, avgSpend);

      if (spendChange > thresholds.overspendPercent) {
        alerts.push({
          id: generateId(),
          category: "budget",
          severity: spendChange > thresholds.overspendPercent * 2 ? "critical" : "warning",
          title: `${campaignName} 花費超支`,
          description: `今日花費 $${latest.spend.toFixed(2)} 超過 7 日平均 $${avgSpend.toFixed(2)} 達 ${spendChange.toFixed(1)}%`,
          metric: "spend",
          currentValue: latest.spend,
          previousValue: avgSpend,
          changePercent: spendChange,
          platform,
          accountName,
          campaignName,
          detectedAt: latest.date,
          recommendation: "檢查預算設定是否正確，確認是否有出價異常",
        });
      }

      if (spendChange < -thresholds.underspendPercent) {
        alerts.push({
          id: generateId(),
          category: "budget",
          severity: "warning",
          title: `${campaignName} 花費不足`,
          description: `今日花費 $${latest.spend.toFixed(2)} 低於 7 日平均 $${avgSpend.toFixed(2)} 達 ${Math.abs(spendChange).toFixed(1)}%`,
          metric: "spend",
          currentValue: latest.spend,
          previousValue: avgSpend,
          changePercent: spendChange,
          platform,
          accountName,
          campaignName,
          detectedAt: latest.date,
          recommendation: "檢查廣告是否被暫停、預算是否耗盡、或受眾規模是否縮小",
        });
      }
    }

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
  if (source.includes("facebook") || source.includes("instagram")) return "meta";
  if (source.includes("google")) return "google";
  return "all";
}

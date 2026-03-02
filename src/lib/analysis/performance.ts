import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert, AnalysisThresholds } from "./types";
import { average, percentChange, generateId } from "@/lib/utils/math";

/**
 * 成效下降警示
 * 策略：將資料分成前半段（基準期）與後半段（當前期），比較各 campaign 的 KPI
 */
export function detectPerformanceDecline(
  data: WindsorAdRecord[],
  thresholds: AnalysisThresholds["performance"],
): Alert[] {
  const alerts: Alert[] = [];

  // 依 campaign 分組
  const campaignMap = groupByCampaign(data);

  for (const [campaignName, records] of Object.entries(campaignMap)) {
    const sorted = records.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    if (sorted.length < 4) continue;

    const midpoint = Math.floor(sorted.length / 2);
    const previousPeriod = sorted.slice(0, midpoint);
    const currentPeriod = sorted.slice(midpoint);
    const platform = toPlatform(sorted[0].source);
    const accountName = sorted[0].account_name;

    // CTR 下降偵測
    const prevCtr = average(previousPeriod.map((r) => r.ctr));
    const currCtr = average(currentPeriod.map((r) => r.ctr));
    if (prevCtr > 0) {
      const ctrChange = percentChange(currCtr, prevCtr);
      if (ctrChange < -thresholds.ctrDropPercent) {
        alerts.push({
          id: generateId(),
          category: "performance",
          severity: "warning",
          title: `${campaignName} CTR 下降`,
          description: `CTR 從 ${prevCtr.toFixed(2)}% 降至 ${currCtr.toFixed(2)}%，下降 ${Math.abs(ctrChange).toFixed(1)}%`,
          metric: "ctr",
          currentValue: currCtr,
          previousValue: prevCtr,
          changePercent: ctrChange,
          platform,
          accountName,
          campaignName,
          detectedAt: currentPeriod[currentPeriod.length - 1].date,
          recommendation: "更新廣告素材或調整受眾定位，嘗試新的文案角度",
        });
      }
    }

    // 轉換率下降
    const prevClicks = previousPeriod.reduce((s, r) => s + r.clicks, 0);
    const prevConv = previousPeriod.reduce((s, r) => s + r.conversions, 0);
    const currClicks = currentPeriod.reduce((s, r) => s + r.clicks, 0);
    const currConv = currentPeriod.reduce((s, r) => s + r.conversions, 0);

    const prevConvRate = prevClicks > 0 ? (prevConv / prevClicks) * 100 : 0;
    const currConvRate = currClicks > 0 ? (currConv / currClicks) * 100 : 0;

    if (prevConvRate > 0) {
      const convChange = percentChange(currConvRate, prevConvRate);
      if (convChange < -thresholds.convRateDropPercent) {
        alerts.push({
          id: generateId(),
          category: "performance",
          severity: "warning",
          title: `${campaignName} 轉換率下降`,
          description: `轉換率從 ${prevConvRate.toFixed(2)}% 降至 ${currConvRate.toFixed(2)}%，下降 ${Math.abs(convChange).toFixed(1)}%`,
          metric: "conversion_rate",
          currentValue: currConvRate,
          previousValue: prevConvRate,
          changePercent: convChange,
          platform,
          accountName,
          campaignName,
          detectedAt: currentPeriod[currentPeriod.length - 1].date,
          recommendation: "檢查著陸頁是否正常、優惠是否到期、或檢查追蹤碼是否異常",
        });
      }
    }

    // ROAS 下降
    const prevRoas = average(previousPeriod.map((r) => r.roas));
    const currRoas = average(currentPeriod.map((r) => r.roas));
    if (prevRoas > 0) {
      const roasChange = percentChange(currRoas, prevRoas);
      if (roasChange < -thresholds.roasDropPercent) {
        alerts.push({
          id: generateId(),
          category: "performance",
          severity: currRoas < thresholds.roasMinThreshold ? "critical" : "warning",
          title: `${campaignName} ROAS 下降`,
          description: `ROAS 從 ${prevRoas.toFixed(2)}x 降至 ${currRoas.toFixed(2)}x，下降 ${Math.abs(roasChange).toFixed(1)}%`,
          metric: "roas",
          currentValue: currRoas,
          previousValue: prevRoas,
          changePercent: roasChange,
          platform,
          accountName,
          campaignName,
          detectedAt: currentPeriod[currentPeriod.length - 1].date,
          recommendation:
            currRoas < thresholds.roasMinThreshold
              ? "ROAS 已低於虧損線，建議立即降低預算或暫停此活動"
              : "檢查商品定價、受眾品質和出價策略",
        });
      }
    }

    // ROAS 低於虧損線（即使沒有下降）
    if (currRoas > 0 && currRoas < thresholds.roasMinThreshold) {
      const totalSpend = currentPeriod.reduce((s, r) => s + r.spend, 0);
      if (totalSpend > 50) {
        alerts.push({
          id: generateId(),
          category: "performance",
          severity: "critical",
          title: `${campaignName} ROAS 低於虧損線`,
          description: `當前 ROAS ${currRoas.toFixed(2)}x 低於門檻 ${thresholds.roasMinThreshold}x，正在虧損`,
          metric: "roas",
          currentValue: currRoas,
          previousValue: thresholds.roasMinThreshold,
          changePercent: percentChange(currRoas, thresholds.roasMinThreshold),
          platform,
          accountName,
          campaignName,
          detectedAt: currentPeriod[currentPeriod.length - 1].date,
          recommendation: "立即降低預算或暫停此活動，重新評估受眾和素材策略",
        });
      }
    }
  }

  return alerts;
}

function groupByCampaign(data: WindsorAdRecord[]): Record<string, WindsorAdRecord[]> {
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

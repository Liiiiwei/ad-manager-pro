import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert, AnalysisThresholds } from "./types";
import { linearSlope, percentChange, generateId } from "@/lib/utils/math";

/**
 * 素材疲勞偵測
 * 策略：追蹤每個廣告素材的 frequency 和 CTR 趨勢
 */
export function detectCreativeFatigue(
  data: WindsorAdRecord[],
  thresholds: AnalysisThresholds["creative"],
): Alert[] {
  const alerts: Alert[] = [];

  // 依 ad_name 分組
  const adMap = groupByAd(data);

  for (const [adName, records] of Object.entries(adMap)) {
    if (!adName || adName === "") continue;

    const sorted = records.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // 只取最近 N 天的資料
    const recent = sorted.slice(-thresholds.fatigueWindowDays);
    if (recent.length < 3) continue;

    const platform = toPlatform(sorted[0].source);
    const accountName = sorted[0].account_name;
    const campaignName = sorted[0].campaign;
    const adsetName = sorted[0].adset;

    const latestFrequency = recent[recent.length - 1].frequency;
    const ctrValues = recent.map((r) => r.ctr);
    const ctrSlope = linearSlope(ctrValues);
    const firstCtr = ctrValues[0];
    const lastCtr = ctrValues[ctrValues.length - 1];
    const ctrChange = firstCtr > 0 ? percentChange(lastCtr, firstCtr) : 0;

    const isHighFrequency = latestFrequency > thresholds.highFrequency;
    const isCtrDeclining = ctrSlope < 0 && Math.abs(ctrChange) > thresholds.ctrDeclinePercent;

    if (isHighFrequency && isCtrDeclining) {
      // 高頻率 + CTR 下降 = critical
      alerts.push({
        id: generateId(),
        category: "creative",
        severity: "critical",
        title: `${adName} 素材嚴重疲勞`,
        description: `頻率 ${latestFrequency.toFixed(1)} 超過門檻 ${thresholds.highFrequency}，CTR 同時下降 ${Math.abs(ctrChange).toFixed(1)}%`,
        metric: "frequency",
        currentValue: latestFrequency,
        previousValue: thresholds.highFrequency,
        changePercent: ctrChange,
        platform,
        accountName,
        campaignName,
        adsetName,
        adName,
        detectedAt: recent[recent.length - 1].date,
        recommendation: "立即更換廣告素材，受眾已對此素材產生疲勞",
      });
    } else if (isHighFrequency) {
      // 單純高頻率
      alerts.push({
        id: generateId(),
        category: "creative",
        severity: "warning",
        title: `${adName} 頻率過高`,
        description: `頻率達 ${latestFrequency.toFixed(1)}（門檻 ${thresholds.highFrequency}），建議準備替換素材`,
        metric: "frequency",
        currentValue: latestFrequency,
        previousValue: thresholds.highFrequency,
        changePercent: 0,
        platform,
        accountName,
        campaignName,
        adsetName,
        adName,
        detectedAt: recent[recent.length - 1].date,
        recommendation: "準備新的廣告素材，目前頻率偏高可能導致成效下降",
      });
    } else if (isCtrDeclining) {
      // 單純 CTR 下降
      alerts.push({
        id: generateId(),
        category: "creative",
        severity: "warning",
        title: `${adName} CTR 持續走低`,
        description: `近 ${recent.length} 天 CTR 從 ${firstCtr.toFixed(2)}% 降至 ${lastCtr.toFixed(2)}%`,
        metric: "ctr",
        currentValue: lastCtr,
        previousValue: firstCtr,
        changePercent: ctrChange,
        platform,
        accountName,
        campaignName,
        adsetName,
        adName,
        detectedAt: recent[recent.length - 1].date,
        recommendation: "考慮測試新的文案或視覺素材",
      });
    }
  }

  return alerts;
}

function groupByAd(data: WindsorAdRecord[]): Record<string, WindsorAdRecord[]> {
  const map: Record<string, WindsorAdRecord[]> = {};
  for (const record of data) {
    const key = record.ad_name || "";
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

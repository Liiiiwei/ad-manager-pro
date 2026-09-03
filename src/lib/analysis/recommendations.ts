import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert, AnalysisThresholds } from "./types";
import { average, generateId } from "@/lib/utils/math";

/**
 * 擴量/停止建議
 * 策略：根據 ROAS 和花費門檻產生行動建議
 */
export function generateRecommendations(
  data: WindsorAdRecord[],
  thresholds: AnalysisThresholds["recommendation"],
): Alert[] {
  const alerts: Alert[] = [];

  // 依 campaign 分組
  const campaignMap = groupByCampaign(data);

  for (const [campaignName, records] of Object.entries(campaignMap)) {
    const totalSpend = records.reduce((s, r) => s + r.spend, 0);

    // 花費門檻：太少的數據不做判斷
    if (totalSpend < thresholds.minSpendForDecision) continue;

    const platform = toPlatform(records[0].source);
    const accountName = records[0].account_name;
    const avgRoas = average(records.map((r) => r.roas));
    const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);

    // 依日期排序，檢查連續天數
    const sorted = records.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // 表現良好：ROAS 高且花費達標（門檻 minSpendForDecision 已在上方過濾小花費雜訊）
    // 正向通知（severity good，綠色），與紅／琥珀的問題警示區隔，讓使用者也看得到做對的活動
    if (avgRoas >= thresholds.scaleRoasMin) {
      alerts.push({
        id: generateId(),
        category: "recommendation",
        severity: "good",
        title: `${campaignName} 表現良好`,
        description: `平均 ROAS ${avgRoas.toFixed(2)}x（門檻 ${thresholds.scaleRoasMin}x），花費 $${totalSpend.toFixed(2)}，營收 $${totalRevenue.toFixed(2)}`,
        metric: "roas",
        currentValue: avgRoas,
        previousValue: thresholds.scaleRoasMin,
        changePercent: 0,
        platform,
        accountName,
        campaignName,
        detectedAt: sorted[sorted.length - 1].date,
        recommendation: "表現優異，建議每次增加 20% 預算進行擴量測試",
      });
    }

    // 建議停止：ROAS 持續低於門檻
    if (avgRoas <= thresholds.killRoasMax) {
      // 檢查是否連續 3 天以上 ROAS 低
      const lowRoasDays = sorted.filter(
        (r) => r.roas <= thresholds.killRoasMax,
      );
      const consecutiveLow = countConsecutiveLowDays(
        sorted,
        thresholds.killRoasMax,
      );

      if (consecutiveLow >= 3 || lowRoasDays.length >= sorted.length * 0.7) {
        alerts.push({
          id: generateId(),
          category: "recommendation",
          severity: "critical",
          title: `${campaignName} 建議停止投放`,
          description: `ROAS ${avgRoas.toFixed(2)}x 持續低於 ${thresholds.killRoasMax}x（連續 ${consecutiveLow} 天），已花費 $${totalSpend.toFixed(2)}`,
          metric: "roas",
          currentValue: avgRoas,
          previousValue: thresholds.killRoasMax,
          changePercent: 0,
          platform,
          campaignName,
          detectedAt: sorted[sorted.length - 1].date,
          recommendation: "此活動持續虧損，建議暫停並將預算轉移至高效活動",
        });
      }
    }

    // 中間地帶：有下降趨勢，建議觀察
    if (
      avgRoas > thresholds.killRoasMax &&
      avgRoas < thresholds.scaleRoasMin &&
      sorted.length >= 4
    ) {
      const midpoint = Math.floor(sorted.length / 2);
      const firstHalf = average(sorted.slice(0, midpoint).map((r) => r.roas));
      const secondHalf = average(sorted.slice(midpoint).map((r) => r.roas));

      if (firstHalf > 0 && secondHalf < firstHalf * 0.8) {
        alerts.push({
          id: generateId(),
          category: "recommendation",
          severity: "warning",
          title: `${campaignName} ROAS 趨勢下滑`,
          description: `ROAS 從 ${firstHalf.toFixed(2)}x 降至 ${secondHalf.toFixed(2)}x，建議密切觀察`,
          metric: "roas",
          currentValue: secondHalf,
          previousValue: firstHalf,
          changePercent: ((secondHalf - firstHalf) / firstHalf) * 100,
          platform,
          campaignName,
          detectedAt: sorted[sorted.length - 1].date,
          recommendation:
            "ROAS 正在下滑，建議調整出價或更新素材，若持續下降考慮暫停",
        });
      }
    }
  }

  return alerts;
}

function countConsecutiveLowDays(
  sorted: WindsorAdRecord[],
  threshold: number,
): number {
  let maxConsecutive = 0;
  let current = 0;

  for (const record of sorted) {
    if (record.roas <= threshold) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }

  return maxConsecutive;
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

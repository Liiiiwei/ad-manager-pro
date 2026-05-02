import type { AnalysisThresholds } from "@/lib/analysis/types";
import { SettingsSection } from "./settings-section";
import { ThresholdGroup } from "./threshold-group";

/** 閾值區塊 props */
export interface ThresholdSectionProps {
  thresholds: AnalysisThresholds;
  dirty: boolean;
  onUpdate: (
    group: keyof AnalysisThresholds,
    key: string,
    value: number,
  ) => void;
  onReset: () => void;
}

/** 分析閾值設定區塊 */
export function ThresholdSection({
  thresholds,
  dirty,
  onUpdate,
  onReset,
}: ThresholdSectionProps) {
  return (
    <SettingsSection
      title="分析閾值設定"
      description="調整各分析模組的偵測門檻，修改後點擊儲存生效"
      icon={
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      }
      badge={dirty ? "未儲存" : undefined}
      badgeColor="text-amber-600 bg-amber-50"
    >
      <div className="space-y-4">
        <ThresholdGroup
          title="預算異常"
          items={[
            {
              label: "CPC 暴漲",
              value: thresholds.budget.cpcSpikePercent,
              suffix: "%",
              desc: "CPC 超過移動平均的百分比",
              onChange: (v) => onUpdate("budget", "cpcSpikePercent", v),
            },
            {
              label: "CPM 暴漲",
              value: thresholds.budget.cpmSpikePercent,
              suffix: "%",
              desc: "CPM 超過移動平均的百分比",
              onChange: (v) => onUpdate("budget", "cpmSpikePercent", v),
            },
          ]}
        />

        <ThresholdGroup
          title="成效下降"
          items={[
            {
              label: "CTR 下降",
              value: thresholds.performance.ctrDropPercent,
              suffix: "%",
              desc: "CTR 下降超過此百分比",
              onChange: (v) => onUpdate("performance", "ctrDropPercent", v),
            },
            {
              label: "轉換率下降",
              value: thresholds.performance.convRateDropPercent,
              suffix: "%",
              desc: "轉換率下降超過此百分比",
              onChange: (v) =>
                onUpdate("performance", "convRateDropPercent", v),
            },
            {
              label: "ROAS 下降",
              value: thresholds.performance.roasDropPercent,
              suffix: "%",
              desc: "ROAS 下降超過此百分比",
              onChange: (v) => onUpdate("performance", "roasDropPercent", v),
            },
            {
              label: "ROAS 虧損線",
              value: thresholds.performance.roasMinThreshold,
              suffix: "x",
              desc: "ROAS 低於此值視為虧損",
              step: 0.1,
              onChange: (v) => onUpdate("performance", "roasMinThreshold", v),
            },
          ]}
        />

        <ThresholdGroup
          title="素材疲勞"
          items={[
            {
              label: "高頻率門檻",
              value: thresholds.creative.highFrequency,
              suffix: "",
              desc: "頻率超過此值觸發警告",
              step: 0.5,
              onChange: (v) => onUpdate("creative", "highFrequency", v),
            },
            {
              label: "CTR 衰退",
              value: thresholds.creative.ctrDeclinePercent,
              suffix: "%",
              desc: "素材 CTR 下降百分比",
              onChange: (v) => onUpdate("creative", "ctrDeclinePercent", v),
            },
            {
              label: "觀察天數",
              value: thresholds.creative.fatigueWindowDays,
              suffix: " 天",
              desc: "用於判斷趨勢的天數",
              onChange: (v) => onUpdate("creative", "fatigueWindowDays", v),
            },
          ]}
        />

        <ThresholdGroup
          title="擴量/停止建議"
          items={[
            {
              label: "擴量門檻",
              value: thresholds.recommendation.scaleRoasMin,
              suffix: "x",
              desc: "ROAS 達此值建議擴量",
              step: 0.5,
              onChange: (v) => onUpdate("recommendation", "scaleRoasMin", v),
            },
            {
              label: "停止門檻",
              value: thresholds.recommendation.killRoasMax,
              suffix: "x",
              desc: "ROAS 低於此值建議停止",
              step: 0.1,
              onChange: (v) => onUpdate("recommendation", "killRoasMax", v),
            },
            {
              label: "最低花費",
              value: thresholds.recommendation.minSpendForDecision,
              suffix: "$",
              desc: "低於此花費不給建議",
              onChange: (v) =>
                onUpdate("recommendation", "minSpendForDecision", v),
            },
          ]}
        />
      </div>

      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-card-border">
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors"
        >
          恢復預設值
        </button>
      </div>
    </SettingsSection>
  );
}

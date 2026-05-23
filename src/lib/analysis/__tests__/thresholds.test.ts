import { describe, it, expect } from "vitest";
import { DEFAULT_THRESHOLDS, mergeThresholds } from "../thresholds";

describe("mergeThresholds", () => {
  it("null / undefined 都回 DEFAULT_THRESHOLDS", () => {
    expect(mergeThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(mergeThresholds(undefined)).toEqual(DEFAULT_THRESHOLDS);
  });

  it("非物件（字串 / 數字 / 陣列）都回 DEFAULT_THRESHOLDS", () => {
    expect(mergeThresholds("not-an-object")).toEqual(DEFAULT_THRESHOLDS);
    expect(mergeThresholds(123)).toEqual(DEFAULT_THRESHOLDS);
    expect(mergeThresholds([1, 2, 3])).toEqual(DEFAULT_THRESHOLDS);
  });

  it("空物件回 DEFAULT_THRESHOLDS 的副本", () => {
    const result = mergeThresholds({});
    expect(result).toEqual(DEFAULT_THRESHOLDS);
    // 確認是新物件不是 reference（避免 caller 改變污染原始 default）
    expect(result).not.toBe(DEFAULT_THRESHOLDS);
    expect(result.budget).not.toBe(DEFAULT_THRESHOLDS.budget);
  });

  it("部分覆寫單一群組單一欄位，其他維持 default", () => {
    const result = mergeThresholds({
      budget: { cpcSpikePercent: 99 },
    });
    expect(result.budget.cpcSpikePercent).toBe(99);
    // 同群組其他欄位回 default
    expect(result.budget.cpmSpikePercent).toBe(
      DEFAULT_THRESHOLDS.budget.cpmSpikePercent,
    );
    // 其他群組整組回 default
    expect(result.performance).toEqual(DEFAULT_THRESHOLDS.performance);
    expect(result.creative).toEqual(DEFAULT_THRESHOLDS.creative);
    expect(result.recommendation).toEqual(DEFAULT_THRESHOLDS.recommendation);
  });

  it("整組覆寫多群組", () => {
    const result = mergeThresholds({
      budget: { cpcSpikePercent: 10, cpmSpikePercent: 20 },
      creative: { highFrequency: 5 },
    });
    expect(result.budget.cpcSpikePercent).toBe(10);
    expect(result.budget.cpmSpikePercent).toBe(20);
    expect(result.creative.highFrequency).toBe(5);
    // 未覆寫欄位回 default
    expect(result.creative.ctrDeclinePercent).toBe(
      DEFAULT_THRESHOLDS.creative.ctrDeclinePercent,
    );
  });

  it("非法數值（NaN / Infinity / 負值）整個 partial 被丟掉，整體回 default", () => {
    // strict + safeParse 失敗時 fallback 到 {}，整體回 default
    const withNaN = mergeThresholds({
      budget: { cpcSpikePercent: NaN },
    });
    expect(withNaN).toEqual(DEFAULT_THRESHOLDS);

    const withInfinity = mergeThresholds({
      performance: { roasMinThreshold: Infinity },
    });
    expect(withInfinity).toEqual(DEFAULT_THRESHOLDS);

    const withNegative = mergeThresholds({
      creative: { highFrequency: -1 },
    });
    expect(withNegative).toEqual(DEFAULT_THRESHOLDS);
  });

  it("未知 key（strict）導致整體 fallback 到 default", () => {
    const withExtraKey = mergeThresholds({
      budget: { cpcSpikePercent: 50, malicious: 999 },
    });
    expect(withExtraKey).toEqual(DEFAULT_THRESHOLDS);

    const withExtraGroup = mergeThresholds({
      unknownGroup: { whatever: 1 },
    });
    expect(withExtraGroup).toEqual(DEFAULT_THRESHOLDS);
  });

  it("__proto__ 等危險 key 不會污染 prototype", () => {
    const before = ({} as Record<string, unknown>).polluted;
    mergeThresholds(JSON.parse('{"__proto__": {"polluted": "yes"}}'));
    const after = ({} as Record<string, unknown>).polluted;
    expect(after).toBe(before);
  });

  it("結果可被 runFullAnalysis 直接使用（型別完整）", () => {
    const result = mergeThresholds({ budget: { cpcSpikePercent: 33 } });
    // 結構完整：每個 group 的每個 key 都有值
    expect(typeof result.budget.cpcSpikePercent).toBe("number");
    expect(typeof result.budget.cpmSpikePercent).toBe("number");
    expect(typeof result.performance.ctrDropPercent).toBe("number");
    expect(typeof result.performance.convRateDropPercent).toBe("number");
    expect(typeof result.performance.roasDropPercent).toBe("number");
    expect(typeof result.performance.roasMinThreshold).toBe("number");
    expect(typeof result.creative.highFrequency).toBe("number");
    expect(typeof result.creative.ctrDeclinePercent).toBe("number");
    expect(typeof result.creative.fatigueWindowDays).toBe("number");
    expect(typeof result.recommendation.scaleRoasMin).toBe("number");
    expect(typeof result.recommendation.killRoasMax).toBe("number");
    expect(typeof result.recommendation.minSpendForDecision).toBe("number");
  });
});

import type { AnalysisThresholds } from "./types";

/** 電商場景預設閾值 */
export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  budget: {
    cpcSpikePercent: 50,
    cpmSpikePercent: 40,
  },
  performance: {
    ctrDropPercent: 20,
    convRateDropPercent: 25,
    roasDropPercent: 30,
    roasMinThreshold: 1.5,
  },
  creative: {
    highFrequency: 3.0,
    ctrDeclinePercent: 15,
    fatigueWindowDays: 7,
  },
  recommendation: {
    scaleRoasMin: 3.0,
    killRoasMax: 0.8,
    minSpendForDecision: 50,
  },
};

const THRESHOLDS_KEY = "analysis_thresholds";

/** 從 localStorage 讀取閾值，若無則回傳預設值 */
export function getThresholds(): AnalysisThresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

/** 儲存閾值到 localStorage */
export function saveThresholds(thresholds: AnalysisThresholds): void {
  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(thresholds));
}

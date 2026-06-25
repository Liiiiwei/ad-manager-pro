import { z } from "zod";
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

/**
 * AnalysisThresholds 的巢狀 Zod schema（strict，禁未列名欄位）
 * - 每組與每欄位都 .optional()，允許前端只送變動的子集
 * - 全部數值要 finite、nonnegative，避免 NaN / Infinity / 負值汙染分析
 */
const budgetSchema = z
  .object({
    cpcSpikePercent: z.number().finite().nonnegative().optional(),
    cpmSpikePercent: z.number().finite().nonnegative().optional(),
  })
  .strict();

const performanceSchema = z
  .object({
    ctrDropPercent: z.number().finite().nonnegative().optional(),
    convRateDropPercent: z.number().finite().nonnegative().optional(),
    roasDropPercent: z.number().finite().nonnegative().optional(),
    roasMinThreshold: z.number().finite().nonnegative().optional(),
  })
  .strict();

const creativeSchema = z
  .object({
    highFrequency: z.number().finite().nonnegative().optional(),
    ctrDeclinePercent: z.number().finite().nonnegative().optional(),
    fatigueWindowDays: z.number().finite().nonnegative().optional(),
  })
  .strict();

const recommendationSchema = z
  .object({
    scaleRoasMin: z.number().finite().nonnegative().optional(),
    killRoasMax: z.number().finite().nonnegative().optional(),
    minSpendForDecision: z.number().finite().nonnegative().optional(),
  })
  .strict();

export const thresholdsSchema = z
  .object({
    budget: budgetSchema.optional(),
    performance: performanceSchema.optional(),
    creative: creativeSchema.optional(),
    recommendation: recommendationSchema.optional(),
  })
  .strict();

export type ThresholdsInput = z.infer<typeof thresholdsSchema>;

/**
 * 與 DEFAULT_THRESHOLDS 做巢狀合併
 * - 接受 unknown：DB 內可能殘留舊版 / 不完整 / 損毀資料
 * - 對非物件、null、陣列直接退回 default
 * - 任何欄位驗證失敗就丟掉那欄，用 default 補上
 */
export function mergeThresholds(partial: unknown): AnalysisThresholds {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    return DEFAULT_THRESHOLDS;
  }
  const parsed = thresholdsSchema.safeParse(partial);
  const safe: ThresholdsInput = parsed.success ? parsed.data : {};
  return {
    budget: { ...DEFAULT_THRESHOLDS.budget, ...(safe.budget ?? {}) },
    performance: {
      ...DEFAULT_THRESHOLDS.performance,
      ...(safe.performance ?? {}),
    },
    creative: { ...DEFAULT_THRESHOLDS.creative, ...(safe.creative ?? {}) },
    recommendation: {
      ...DEFAULT_THRESHOLDS.recommendation,
      ...(safe.recommendation ?? {}),
    },
  };
}

const THRESHOLDS_KEY = "analysis_thresholds";

/** 從 localStorage 讀取閾值，若無則回傳預設值（巢狀合併、容錯壞資料） */
export function getThresholds(): AnalysisThresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return mergeThresholds(JSON.parse(raw));
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

/** 儲存閾值到 localStorage */
export function saveThresholds(thresholds: AnalysisThresholds): void {
  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(thresholds));
}

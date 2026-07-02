/** 預算配速等級（雙向三色）：健康 / 注意 / 嚴重偏離 */
export type PacingLevel = "good" | "warn" | "bad";

/**
 * 雙向三色配速判定（progress = 花費 ÷ 期間預算）：
 * - 85%～110% → good（健康）
 * - 70%～85%、110%～120% → warn（注意）
 * - <70%、>120% → bad（嚴重偏離）
 */
export function pacingLevel(progress: number): PacingLevel {
  if (progress >= 0.85 && progress <= 1.1) return "good";
  if (progress >= 0.7 && progress < 0.85) return "warn";
  if (progress > 1.1 && progress <= 1.2) return "warn";
  return "bad";
}

/** 等級 → 文字顏色 token */
export const PACING_TEXT: Record<PacingLevel, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
};

/** 等級 → 進度條 / 圓點背景 token */
export const PACING_BG: Record<PacingLevel, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
};

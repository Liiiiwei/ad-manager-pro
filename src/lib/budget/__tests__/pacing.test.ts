import { describe, it, expect } from "vitest";
import { detectPacingOverspend } from "../pacing";
import type { AccountSummary } from "@/lib/initiatives/types";

function acc(overrides: Partial<AccountSummary>): AccountSummary {
  return {
    accountName: "測試帳號",
    platform: "Meta",
    spend: 0,
    periodBudget: 1000,
    hasBudget: true,
    progress: 0,
    budgetSource: "manual",
    monthlyBudget: 30000,
    ...overrides,
  };
}

describe("detectPacingOverspend", () => {
  it("配速比剛好 1.10 不算超支（門檻為嚴格大於）", () => {
    const result = detectPacingOverspend([acc({ progress: 1.10 })]);
    expect(result).toEqual([]);
  });

  it("1.10 < 比值 ≤ 1.25 標記 warning", () => {
    const result = detectPacingOverspend([acc({ progress: 1.2, spend: 1200 })]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("warning");
    expect(result[0].pacingRatio).toBe(1.2);
    expect(result[0].monthSpend).toBe(1200);
  });

  it("比值剛好 1.25 仍為 warning，大於 1.25 才 critical", () => {
    expect(detectPacingOverspend([acc({ progress: 1.25 })])[0].severity).toBe("warning");
    expect(detectPacingOverspend([acc({ progress: 1.26 })])[0].severity).toBe("critical");
  });

  it("未設手動月預算的帳號跳過（budgetSource 非 manual）", () => {
    const result = detectPacingOverspend([acc({ progress: 2, budgetSource: "api", monthlyBudget: undefined })]);
    expect(result).toEqual([]);
  });

  it("periodBudget 為 0 跳過（避免除零殘留）", () => {
    const result = detectPacingOverspend([acc({ progress: 2, periodBudget: 0, hasBudget: false })]);
    expect(result).toEqual([]);
  });
});

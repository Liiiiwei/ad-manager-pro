import { describe, it, expect } from "vitest";
import { projectEndOfMonth } from "../projection";

describe("projectEndOfMonth", () => {
  it("一般情況：線性外推月底花費、比例與建議日均", () => {
    // 30 天月，已過 10 天花 12,000（日均 1,200），月預算 30,000
    const result = projectEndOfMonth({
      monthSpend: 12000,
      elapsedDays: 10,
      daysInMonth: 30,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBe(36000); // 1200 × 30
    expect(result.projectedRatio).toBeCloseTo(1.2); // 36000 ÷ 30000
    expect(result.suggestedDailySpend).toBe(900); // (30000 − 12000) ÷ 20
  });

  it("配速健康：預估比例 < 1", () => {
    const result = projectEndOfMonth({
      monthSpend: 9000,
      elapsedDays: 10,
      daysInMonth: 30,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBe(27000);
    expect(result.projectedRatio).toBeCloseTo(0.9);
    expect(result.suggestedDailySpend).toBe(1050);
  });

  it("elapsedDays = 0：無日均可外推，全部落點欄位為 null，但建議日均可算", () => {
    const result = projectEndOfMonth({
      monthSpend: 0,
      elapsedDays: 0,
      daysInMonth: 30,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBeNull();
    expect(result.projectedRatio).toBeNull();
    expect(result.suggestedDailySpend).toBe(1000); // 30000 ÷ 30
  });

  it("剩餘 0 天（月底最後一天已過）：建議日均為 null", () => {
    const result = projectEndOfMonth({
      monthSpend: 28000,
      elapsedDays: 30,
      daysInMonth: 30,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBe(28000); // 日均 × 30 = 本月至今
    expect(result.projectedRatio).toBeCloseTo(28000 / 30000);
    expect(result.suggestedDailySpend).toBeNull();
  });

  it("預算已爆：建議日均為 0（不回負數）", () => {
    const result = projectEndOfMonth({
      monthSpend: 35000,
      elapsedDays: 20,
      daysInMonth: 30,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBe(52500);
    expect(result.projectedRatio).toBeCloseTo(1.75);
    expect(result.suggestedDailySpend).toBe(0);
  });

  it("月預算 ≤ 0：比例為 null，落點金額仍可外推", () => {
    const result = projectEndOfMonth({
      monthSpend: 12000,
      elapsedDays: 10,
      daysInMonth: 30,
      monthlyBudget: 0,
    });
    expect(result.projectedEomSpend).toBe(36000);
    expect(result.projectedRatio).toBeNull();
  });

  it("daysInMonth ≤ 0（無效輸入）：全部為 null", () => {
    const result = projectEndOfMonth({
      monthSpend: 12000,
      elapsedDays: 10,
      daysInMonth: 0,
      monthlyBudget: 30000,
    });
    expect(result.projectedEomSpend).toBeNull();
    expect(result.projectedRatio).toBeNull();
    expect(result.suggestedDailySpend).toBeNull();
  });
});

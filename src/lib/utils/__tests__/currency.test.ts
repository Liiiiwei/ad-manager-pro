import { describe, it, expect } from "vitest";
import { rateToTwd, toTwd } from "../currency";

describe("rateToTwd", () => {
  it("TWD 匯率為 1", () => {
    expect(rateToTwd("TWD")).toBe(1);
  });

  it("HKD 有對應匯率且大於 1", () => {
    expect(rateToTwd("HKD")).toBeGreaterThan(1);
  });

  it("大小寫不敏感", () => {
    expect(rateToTwd("hkd")).toBe(rateToTwd("HKD"));
  });

  it("未知幣別回退為 1（視為已是 TWD，不做換算）", () => {
    expect(rateToTwd("XYZ")).toBe(1);
  });

  it("空字串回退為 1", () => {
    expect(rateToTwd("")).toBe(1);
  });
});

describe("toTwd", () => {
  it("TWD 金額原值不變", () => {
    expect(toTwd(1000, "TWD")).toBe(1000);
  });

  it("HKD 金額依匯率換算", () => {
    const rate = rateToTwd("HKD");
    expect(toTwd(1000, "HKD")).toBeCloseTo(1000 * rate, 6);
  });

  it("0 換算後仍為 0", () => {
    expect(toTwd(0, "HKD")).toBe(0);
  });

  it("未知幣別金額原值不變", () => {
    expect(toTwd(500, "XYZ")).toBe(500);
  });
});

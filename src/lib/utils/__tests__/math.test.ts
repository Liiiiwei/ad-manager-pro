import { describe, it, expect } from "vitest";
import { percentChange, average, linearSlope, generateId } from "../math";

describe("percentChange", () => {
  it("計算正向變化", () => {
    expect(percentChange(120, 100)).toBe(20);
  });

  it("計算負向變化", () => {
    expect(percentChange(80, 100)).toBe(-20);
  });

  it("前期為 0、當期為正時回傳 100", () => {
    expect(percentChange(50, 0)).toBe(100);
  });

  it("前期與當期都為 0 時回傳 0", () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it("當期為 0、前期為正時回傳 -100", () => {
    expect(percentChange(0, 100)).toBe(-100);
  });

  it("計算小數值的變化", () => {
    expect(percentChange(1.5, 1.0)).toBeCloseTo(50);
  });
});

describe("average", () => {
  it("計算一般陣列的平均值", () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it("空陣列回傳 0", () => {
    expect(average([])).toBe(0);
  });

  it("單一元素回傳該元素", () => {
    expect(average([7])).toBe(7);
  });

  it("處理小數值", () => {
    expect(average([1.5, 2.5])).toBe(2);
  });

  it("處理含零的陣列", () => {
    expect(average([0, 0, 6])).toBe(2);
  });

  it("處理負數", () => {
    expect(average([-10, 10])).toBe(0);
  });
});

describe("linearSlope", () => {
  it("上升趨勢回傳正斜率", () => {
    expect(linearSlope([1, 2, 3, 4, 5])).toBeCloseTo(1);
  });

  it("下降趨勢回傳負斜率", () => {
    expect(linearSlope([5, 4, 3, 2, 1])).toBeCloseTo(-1);
  });

  it("平坦趨勢回傳 0", () => {
    expect(linearSlope([3, 3, 3, 3])).toBeCloseTo(0);
  });

  it("少於 2 個值回傳 0", () => {
    expect(linearSlope([5])).toBe(0);
    expect(linearSlope([])).toBe(0);
  });

  it("兩個值計算正確斜率", () => {
    expect(linearSlope([0, 10])).toBeCloseTo(10);
  });

  it("非線性資料回傳最佳擬合斜率", () => {
    // [1, 3, 2, 5] — 整體上升趨勢
    const slope = linearSlope([1, 3, 2, 5]);
    expect(slope).toBeGreaterThan(0);
  });
});

describe("generateId", () => {
  it("產生非空字串", () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("產生的 ID 長度為 8", () => {
    expect(generateId().length).toBe(8);
  });

  it("連續產生的 ID 不重複（高機率）", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

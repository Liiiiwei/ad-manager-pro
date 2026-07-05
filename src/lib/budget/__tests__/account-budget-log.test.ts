import { describe, it, expect } from "vitest";
import { diffAccountBudgets } from "../account-budget-log";

describe("diffAccountBudgets", () => {
  it("新增帳號預算：previousValue 為 null", () => {
    const changes = diffAccountBudgets({}, { 魔幻主義: 30000 });
    expect(changes).toEqual([
      { accountName: "魔幻主義", previousValue: null, newValue: 30000 },
    ]);
  });

  it("修改既有預算：帶出新舊值", () => {
    const changes = diffAccountBudgets(
      { 魔幻主義: 30000 },
      { 魔幻主義: 45000 },
    );
    expect(changes).toEqual([
      { accountName: "魔幻主義", previousValue: 30000, newValue: 45000 },
    ]);
  });

  it("移除帳號預算：newValue 為 null", () => {
    const changes = diffAccountBudgets({ 魔幻主義: 30000 }, {});
    expect(changes).toEqual([
      { accountName: "魔幻主義", previousValue: 30000, newValue: null },
    ]);
  });

  it("值不變的帳號不產生變更", () => {
    expect(diffAccountBudgets({ A: 100, B: 200 }, { A: 100, B: 999 })).toEqual([
      { accountName: "B", previousValue: 200, newValue: 999 },
    ]);
  });
});

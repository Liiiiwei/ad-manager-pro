import { describe, it, expect } from "vitest";
import { accountBudgetsSchema, mergeAccountBudgets } from "../account-budgets";

describe("accountBudgetsSchema", () => {
  it("接受正數與 null 值", () => {
    const result = accountBudgetsSchema.safeParse({
      魔幻主義: 31000,
      Class: null,
    });
    expect(result.success).toBe(true);
  });

  it("拒絕負數與零", () => {
    expect(accountBudgetsSchema.safeParse({ A: -1 }).success).toBe(false);
    expect(accountBudgetsSchema.safeParse({ A: 0 }).success).toBe(false);
  });

  it("拒絕超過 1e9 的值", () => {
    expect(accountBudgetsSchema.safeParse({ A: 1e9 + 1 }).success).toBe(false);
  });

  it("拒絕超過 200 字的 key", () => {
    expect(
      accountBudgetsSchema.safeParse({ ["x".repeat(201)]: 100 }).success,
    ).toBe(false);
  });

  it("拒絕非數字值", () => {
    expect(accountBudgetsSchema.safeParse({ A: "100" }).success).toBe(false);
  });
});

describe("mergeAccountBudgets", () => {
  it("null 值刪除該 key，未送的 key 不動", () => {
    expect(mergeAccountBudgets({ A: 100, B: 200 }, { A: null })).toEqual({
      B: 200,
    });
  });

  it("數字覆寫既有值並可新增 key", () => {
    expect(mergeAccountBudgets({ A: 100 }, { A: 300, C: 50 })).toEqual({
      A: 300,
      C: 50,
    });
  });

  it("existing 非物件（null / 陣列 / 字串）時視為空", () => {
    expect(mergeAccountBudgets(null, { A: 100 })).toEqual({ A: 100 });
    expect(mergeAccountBudgets([1], { A: 100 })).toEqual({ A: 100 });
    expect(mergeAccountBudgets("x", { A: 100 })).toEqual({ A: 100 });
  });

  it("existing 中非正數或非數字值被清掉（防 DB 殘留髒資料）", () => {
    expect(mergeAccountBudgets({ A: -5, B: "x", C: 100 }, {})).toEqual({
      C: 100,
    });
  });
});

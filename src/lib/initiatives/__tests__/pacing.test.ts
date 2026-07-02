import { describe, it, expect } from "vitest";
import { pacingLevel, PACING_TEXT, PACING_BG } from "../pacing";

describe("pacingLevel 雙向三色門檻", () => {
  it("85%～110% 為 good（含邊界）", () => {
    expect(pacingLevel(0.85)).toBe("good");
    expect(pacingLevel(1.0)).toBe("good");
    expect(pacingLevel(1.1)).toBe("good");
  });

  it("70%～85% 為 warn（低於配速的注意帶）", () => {
    expect(pacingLevel(0.7)).toBe("warn");
    expect(pacingLevel(0.84)).toBe("warn");
  });

  it("110%～120% 為 warn（超支的注意帶）", () => {
    expect(pacingLevel(1.11)).toBe("warn");
    expect(pacingLevel(1.2)).toBe("warn");
  });

  it("低於 70% 為 bad", () => {
    expect(pacingLevel(0.699)).toBe("bad");
    expect(pacingLevel(0)).toBe("bad");
  });

  it("超過 120% 為 bad", () => {
    expect(pacingLevel(1.201)).toBe("bad");
    expect(pacingLevel(2)).toBe("bad");
  });
});

describe("token 對應表", () => {
  it("三個等級都有文字色與背景色 token", () => {
    expect(PACING_TEXT.good).toBe("text-success");
    expect(PACING_TEXT.warn).toBe("text-warning");
    expect(PACING_TEXT.bad).toBe("text-danger");
    expect(PACING_BG.good).toBe("bg-success");
    expect(PACING_BG.warn).toBe("bg-warning");
    expect(PACING_BG.bad).toBe("bg-danger");
  });
});

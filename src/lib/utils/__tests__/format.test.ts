import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
  formatCtr,
  maskApiKey,
} from "../format";

describe("formatCurrency", () => {
  it("格式化一般金額", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("整數金額不顯示小數", () => {
    expect(formatCurrency(1000)).toBe("$1,000");
  });

  it("零元", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("負數金額", () => {
    expect(formatCurrency(-500)).toBe("-$500");
  });

  it("大數字加千分位", () => {
    expect(formatCurrency(1234567)).toBe("$1,234,567");
  });
});

describe("formatNumber", () => {
  it("整數加千分位", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });

  it("小數四捨五入為整數", () => {
    expect(formatNumber(1234.7)).toBe("1,235");
  });

  it("零", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatPercent", () => {
  it("正數前加正號", () => {
    expect(formatPercent(12.34)).toBe("+12.3%");
  });

  it("負數顯示負號", () => {
    expect(formatPercent(-5.67)).toBe("-5.7%");
  });

  it("零不加正號", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatRoas", () => {
  it("格式化 ROAS 值", () => {
    expect(formatRoas(3.5)).toBe("3.50x");
  });

  it("零 ROAS", () => {
    expect(formatRoas(0)).toBe("0.00x");
  });
});

describe("formatCtr", () => {
  it("格式化 CTR 百分比", () => {
    expect(formatCtr(2.345)).toBe("2.35%");
  });

  it("零 CTR", () => {
    expect(formatCtr(0)).toBe("0.00%");
  });
});

describe("maskApiKey", () => {
  it("遮罩長 API Key（顯示前 7 與後 3 字元）", () => {
    const key = "abcdefghijklmnopqrstuvwxyz";
    const masked = maskApiKey(key);
    expect(masked).toBe("abcdefg***...***xyz");
  });

  it("短字串（10 字元以內）回傳 ***", () => {
    expect(maskApiKey("short")).toBe("***");
    expect(maskApiKey("1234567890")).toBe("***"); // 剛好 10 字元
  });

  it("11 字元開始正常遮罩", () => {
    const key = "12345678901";
    expect(maskApiKey(key)).toBe("1234567***...***901");
  });

  it("空字串回傳 ***", () => {
    expect(maskApiKey("")).toBe("***");
  });
});

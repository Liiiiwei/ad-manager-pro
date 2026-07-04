import { describe, it, expect } from "vitest";
import type { DailySummary } from "@/lib/digest/build-daily-summary";
import type { TriggeredAlert } from "@/lib/alerts/types";
import {
  COLORS,
  pacingHex,
  safeText,
  MAX_ALERT_ROWS,
  buildDigestFlex,
  buildAlertFlex,
  buildTestFlex,
  buildDigestText,
  buildAlertText,
} from "../flex";

const APP_URL = "https://example.com";

/** 產生測試用摘要 */
function makeSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: "2026-07-03",
    yesterdaySpend: 12345,
    yesterdayRoas: 3.21,
    yesterdayCpa: 250,
    monthSpend: 90000,
    monthBudget: 100000,
    monthProgress: 0.9,
    accounts: [],
    alerts: [],
    ...overrides,
  };
}

/** 產生測試用異常 */
function makeAlert(overrides: Partial<TriggeredAlert> = {}): TriggeredAlert {
  return {
    ruleId: "rule-1",
    ruleName: "測試規則",
    title: "花費異常",
    message: "花費 200 超過閾值 100",
    metric: "spend",
    currentValue: 200,
    previousValue: 100,
    changePercent: 100,
    severity: "warning",
    ...overrides,
  };
}

/** 遞迴收集 bubble 內所有 text 節點的文字 */
function collectTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTexts(n, out));
    return out;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") {
      out.push(obj.text);
    }
    Object.values(obj).forEach((v) => collectTexts(v, out));
  }
  return out;
}

describe("safeText / pacingHex", () => {
  it("空字串與純空白墊為「—」", () => {
    expect(safeText("")).toBe("—");
    expect(safeText("   ")).toBe("—");
    expect(safeText("正常")).toBe("正常");
  });

  it("配速色與 pacingLevel 一致：1.0→綠、1.15→黃、1.5→紅", () => {
    expect(pacingHex(1.0)).toBe(COLORS.success);
    expect(pacingHex(1.15)).toBe(COLORS.warning);
    expect(pacingHex(1.5)).toBe(COLORS.danger);
  });
});

describe("buildDigestFlex", () => {
  it("是 bubble，footer 按鈕連到 /daily", () => {
    const bubble = buildDigestFlex(makeSummary(), APP_URL) as {
      type: string;
      footer: { contents: Array<{ action: { uri: string } }> };
    };

    expect(bubble.type).toBe("bubble");
    expect(bubble.footer.contents[0].action.uri).toBe(
      "https://example.com/daily",
    );
  });

  it("所有 text 節點都不是空字串（LINE 硬限制）", () => {
    const texts = collectTexts(buildDigestFlex(makeSummary(), APP_URL));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("ROAS / CPA 為 null 時顯示「—」；無預算顯示「未設定預算」", () => {
    const bubble = buildDigestFlex(
      makeSummary({
        yesterdayRoas: null,
        yesterdayCpa: null,
        monthProgress: null,
        monthBudget: 0,
      }),
      APP_URL,
    );
    const texts = collectTexts(bubble);

    expect(texts).toContain("—");
    expect(texts).toContain("未設定預算");
  });

  it("有異常時顯示件數", () => {
    const bubble = buildDigestFlex(
      makeSummary({ alerts: [makeAlert(), makeAlert({ ruleId: "rule-2" })] }),
      APP_URL,
    );
    const texts = collectTexts(bubble);

    expect(texts.some((t) => t.includes("2 件"))).toBe(true);
  });
});

describe("buildAlertFlex", () => {
  it("超過上限只列 5 件並附「其餘 N 件」", () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ ruleId: `rule-${i}`, title: `異常 ${i}` }),
    );
    const texts = collectTexts(buildAlertFlex(alerts, APP_URL));

    expect(MAX_ALERT_ROWS).toBe(5);
    expect(texts.filter((t) => t.startsWith("異常 ")).length).toBe(5);
    expect(texts.some((t) => t.includes("其餘 2 件"))).toBe(true);
  });

  it("依 severity 排序，header 色為最高嚴重度", () => {
    const alerts = [
      makeAlert({ severity: "info", title: "資訊" }),
      makeAlert({ ruleId: "rule-2", severity: "critical", title: "嚴重" }),
    ];
    const bubble = buildAlertFlex(alerts, APP_URL) as {
      header: { backgroundColor: string };
    };
    const texts = collectTexts(bubble);

    expect(bubble.header.backgroundColor).toBe(COLORS.danger);
    // critical 排在 info 前面
    expect(texts.indexOf("嚴重")).toBeLessThan(texts.indexOf("資訊"));
  });

  it("footer 按鈕連到 /alerts，所有 text 非空", () => {
    const bubble = buildAlertFlex([makeAlert()], APP_URL) as {
      footer: { contents: Array<{ action: { uri: string } }> };
    };

    expect(bubble.footer.contents[0].action.uri).toBe(
      "https://example.com/alerts",
    );
    for (const t of collectTexts(bubble)) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("buildTestFlex / 純文字備援", () => {
  it("buildTestFlex 是 bubble 且 text 非空", () => {
    const bubble = buildTestFlex(APP_URL) as { type: string };
    expect(bubble.type).toBe("bubble");
    for (const t of collectTexts(bubble)) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("buildDigestText 含基準日與連結", () => {
    const text = buildDigestText(makeSummary(), APP_URL);
    expect(text).toContain("2026-07-03");
    expect(text).toContain("https://example.com/daily");
  });

  it("buildAlertText 含件數與連結", () => {
    const text = buildAlertText([makeAlert()], APP_URL);
    expect(text).toContain("1 件");
    expect(text).toContain("https://example.com/alerts");
  });
});

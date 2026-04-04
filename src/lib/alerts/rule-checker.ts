import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { TriggeredAlert, MetricKey, RuleCondition } from "./types";
import { METRIC_LABELS } from "./types";
import { average, percentChange } from "@/lib/utils/math";

interface RuleRow {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  platform: string;
  campaignFilter: string | null;
}

/**
 * 檢查一組規則是否被觸發
 * 策略：將資料依日期排序，比較最近一天 vs 前 7 天平均
 */
export function checkRules(
  rules: RuleRow[],
  data: WindsorAdRecord[],
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    // 依平台過濾
    let filtered = data;
    if (rule.platform === "meta") {
      filtered = data.filter(
        (r) => r.source.includes("facebook") || r.source.includes("instagram"),
      );
    } else if (rule.platform === "google") {
      filtered = data.filter((r) => r.source.includes("google"));
    }

    // 依 campaign 過濾（模糊匹配）
    if (rule.campaignFilter) {
      const keyword = rule.campaignFilter.toLowerCase();
      filtered = filtered.filter((r) =>
        r.campaign.toLowerCase().includes(keyword),
      );
    }

    if (filtered.length < 2) continue;

    // 依日期排序
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // 取得所有日期
    const dates = [...new Set(sorted.map((r) => r.date))].sort();
    if (dates.length < 2) continue;

    const latestDate = dates[dates.length - 1];
    const previousDates = dates.slice(0, -1).slice(-7);

    const latestRecords = sorted.filter((r) => r.date === latestDate);
    const previousRecords = sorted.filter((r) =>
      previousDates.includes(r.date),
    );

    const metric = rule.metric as MetricKey;
    const currentValue = aggregateMetric(latestRecords, metric);
    const previousValue = aggregateMetric(previousRecords, metric);
    const change = percentChange(currentValue, previousValue);
    const condition = rule.condition as RuleCondition;

    const isTriggered = evaluateCondition(
      condition,
      rule.threshold,
      currentValue,
      change,
    );

    if (isTriggered) {
      triggered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        title: buildTitle(rule.name, metric, condition, currentValue),
        message: buildMessage(
          metric,
          condition,
          currentValue,
          previousValue,
          change,
        ),
        metric,
        currentValue,
        previousValue,
        changePercent: change,
        severity: determineSeverity(
          condition,
          rule.threshold,
          currentValue,
          change,
        ),
      });
    }
  }

  return triggered;
}

function aggregateMetric(
  records: WindsorAdRecord[],
  metric: MetricKey,
): number {
  if (records.length === 0) return 0;
  switch (metric) {
    case "spend":
      return records.reduce((s, r) => s + r.spend, 0);
    case "revenue":
      return records.reduce((s, r) => s + r.revenue, 0);
    case "conversions":
      return records.reduce((s, r) => s + r.conversions, 0);
    case "roas": {
      const spend = records.reduce((s, r) => s + r.spend, 0);
      const revenue = records.reduce((s, r) => s + r.revenue, 0);
      return spend > 0 ? revenue / spend : 0;
    }
    case "cpc":
      return average(records.map((r) => r.cpc));
    case "cpm":
      return average(records.map((r) => r.cpm));
    case "ctr":
      return average(records.map((r) => r.ctr));
  }
}

function evaluateCondition(
  condition: RuleCondition,
  threshold: number,
  currentValue: number,
  changePercent: number,
): boolean {
  switch (condition) {
    case "gt":
      return currentValue > threshold;
    case "lt":
      return currentValue < threshold;
    case "change_gt":
      return changePercent > threshold;
    case "change_lt":
      return changePercent < -threshold;
  }
}

function determineSeverity(
  condition: RuleCondition,
  threshold: number,
  currentValue: number,
  changePercent: number,
): "critical" | "warning" | "info" {
  const absChange = Math.abs(changePercent);
  if (condition === "change_gt" || condition === "change_lt") {
    if (absChange > threshold * 2) return "critical";
    if (absChange > threshold * 1.5) return "warning";
    return "info";
  }
  if (condition === "gt" && currentValue > threshold * 1.5) return "critical";
  if (condition === "lt" && currentValue < threshold * 0.5) return "critical";
  return "warning";
}

function buildTitle(
  ruleName: string,
  metric: MetricKey,
  condition: RuleCondition,
  currentValue: number,
): string {
  return `${ruleName}：${METRIC_LABELS[metric]} 異常`;
}

function buildMessage(
  metric: MetricKey,
  condition: RuleCondition,
  currentValue: number,
  previousValue: number,
  changePercent: number,
): string {
  const fmt = (v: number) => v.toFixed(2);
  const label = METRIC_LABELS[metric];

  if (condition === "change_gt" || condition === "change_lt") {
    const dir = changePercent > 0 ? "上升" : "下降";
    return `${label}從 ${fmt(previousValue)} ${dir}至 ${fmt(currentValue)}，${dir === "下降" ? "跌幅" : "漲幅"} ${Math.abs(changePercent).toFixed(1)}%`;
  }
  return `${label}目前值 ${fmt(currentValue)}，已觸發規則門檻`;
}

export interface AlertRuleInput {
  name: string;
  metric: MetricKey;
  condition: RuleCondition;
  threshold: number;
  platform: "all" | "meta" | "google";
  campaignFilter?: string;
  enabled?: boolean;
}

export type MetricKey =
  | "spend"
  | "roas"
  | "cpc"
  | "cpm"
  | "ctr"
  | "conversions"
  | "revenue";

export type RuleCondition =
  | "gt" // 絕對值大於
  | "lt" // 絕對值小於
  | "change_gt" // 變化率大於 (%)
  | "change_lt"; // 變化率小於 (%)

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  title: string;
  message: string;
  metric: MetricKey;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  severity: "critical" | "warning" | "info";
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "花費",
  roas: "ROAS",
  cpc: "CPC",
  cpm: "CPM",
  ctr: "CTR",
  conversions: "轉換數",
  revenue: "營收",
};

export const CONDITION_LABELS: Record<RuleCondition, string> = {
  gt: "大於",
  lt: "小於",
  change_gt: "漲幅超過 (%)",
  change_lt: "跌幅超過 (%)",
};

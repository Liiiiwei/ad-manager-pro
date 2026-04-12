export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory =
  | "budget"
  | "performance"
  | "creative"
  | "recommendation";

export interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  platform: "meta" | "google" | "all";
  accountName?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  detectedAt: string;
  recommendation: string;
}

export interface PlatformMetrics {
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  cpc: number;
  cpm: number;
  ctr: number;
  aov: number;
}

export interface AnalysisResult {
  generatedAt: string;
  dateRange: { from: string; to: string };
  summary: {
    totalSpend: number;
    totalRevenue: number;
    overallRoas: number;
    totalConversions: number;
    avgCpc: number;
    avgCtr: number;
  };
  alerts: Alert[];
  platformBreakdown: {
    meta: PlatformMetrics;
    google: PlatformMetrics;
  };
}

export interface AnalysisThresholds {
  budget: {
    cpcSpikePercent: number;
    cpmSpikePercent: number;
  };
  performance: {
    ctrDropPercent: number;
    convRateDropPercent: number;
    roasDropPercent: number;
    roasMinThreshold: number;
  };
  creative: {
    highFrequency: number;
    ctrDeclinePercent: number;
    fatigueWindowDays: number;
  };
  recommendation: {
    scaleRoasMin: number;
    killRoasMax: number;
    minSpendForDecision: number;
  };
}

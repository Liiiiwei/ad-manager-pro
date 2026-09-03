import Link from "next/link";
import type { Alert } from "@/lib/analysis/types";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import { formatCurrency, formatRoas } from "@/lib/utils/format";

interface PriorityWorkbenchProps {
  alerts: Alert[];
  data: WindsorAdRecord[];
  loading?: boolean;
  error?: string | null;
}

interface CampaignSummary {
  campaign: string;
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
}

function aggregateCampaigns(data: WindsorAdRecord[]): CampaignSummary[] {
  const map = new Map<string, CampaignSummary>();

  for (const record of data) {
    const campaign = record.campaign || "未命名活動";
    const current =
      map.get(campaign) ??
      {
        campaign,
        platform: record.source.includes("facebook")
          ? "Meta"
          : record.source.includes("google")
            ? "Google"
            : record.source,
        spend: 0,
        revenue: 0,
        roas: 0,
      };

    current.spend += record.spend;
    current.revenue += record.revenue;
    current.roas = current.spend > 0 ? current.revenue / current.spend : 0;
    map.set(campaign, current);
  }

  return [...map.values()];
}

export default function PriorityWorkbench({
  alerts,
  data,
  loading,
  error,
}: PriorityWorkbenchProps) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const campaigns = aggregateCampaigns(data);
  const lowRoasCampaigns = campaigns.filter((c) => c.spend > 0 && c.roas < 1);
  const topSpendCampaign = [...campaigns].sort((a, b) => b.spend - a.spend)[0];

  const cards = [
    {
      label: "嚴重警示",
      value: loading ? "分析中" : criticalCount,
      description: error
        ? "分析載入失敗，資料區塊仍可查看"
        : criticalCount > 0
          ? "優先檢查預算或成效異常"
          : "目前沒有嚴重警示",
      href: "/alerts",
      tone:
        error || criticalCount > 0
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-card-border bg-card text-muted",
    },
    {
      label: "警告事項",
      value: loading ? "分析中" : warningCount,
      description: error
        ? "稍後可重新整理警示分析"
        : warningCount > 0
          ? "建議今天完成檢查"
          : "目前沒有警告事項",
      href: "/alerts",
      tone:
        warningCount > 0
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-card-border bg-card text-muted",
    },
    {
      label: "低 ROAS 活動",
      value: lowRoasCampaigns.length,
      description:
        lowRoasCampaigns.length > 0
          ? "ROAS 低於 1，適合先看花費占比"
          : "目前沒有低 ROAS 活動",
      href: "/campaigns",
      tone:
        lowRoasCampaigns.length > 0
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-card-border bg-card text-muted",
    },
    {
      label: "最高花費活動",
      value: topSpendCampaign ? formatCurrency(topSpendCampaign.spend) : "—",
      description: topSpendCampaign
        ? `${topSpendCampaign.campaign} · ${formatRoas(topSpendCampaign.roas)}`
        : "目前沒有活動資料",
      href: "/campaigns",
      tone: "border-accent/20 bg-accent-light text-accent",
    },
  ];

  return (
    <section className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            今日優先處理
          </h2>
          <p className="text-xs text-muted mt-1">
            先看需要決策的帳號與活動，再進入明細。
          </p>
        </div>
        <span className="text-xs text-muted whitespace-nowrap">依目前篩選</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`block rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.tone}`}
          >
            <p className="text-xs font-medium text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-foreground truncate">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-muted line-clamp-2">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

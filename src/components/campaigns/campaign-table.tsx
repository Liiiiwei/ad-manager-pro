"use client";

import { useState, useMemo } from "react";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import { formatCurrency, formatRoas, formatCtr } from "@/lib/utils/format";

interface CampaignTableProps {
  data: WindsorAdRecord[];
}

interface CampaignRow {
  campaign: string;
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number;
  ctr: number;
}

type SortField = keyof CampaignRow;
type SortDir = "asc" | "desc";

export default function CampaignTable({ data }: CampaignTableProps) {
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const campaigns = useMemo(() => {
    const map: Record<string, CampaignRow> = {};

    for (const record of data) {
      const key = record.campaign || "unknown";
      if (!map[key]) {
        map[key] = {
          campaign: key,
          platform: record.source.includes("facebook") ? "Meta" : record.source.includes("google") ? "Google" : record.source,
          spend: 0,
          revenue: 0,
          roas: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          cpc: 0,
          ctr: 0,
        };
      }
      map[key].spend += record.spend;
      map[key].revenue += record.revenue;
      map[key].clicks += record.clicks;
      map[key].impressions += record.impressions;
      map[key].conversions += record.conversions;
    }

    // 計算衍生指標
    for (const row of Object.values(map)) {
      row.roas = row.spend > 0 ? row.revenue / row.spend : 0;
      row.cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    }

    return Object.values(map);
  }, [data]);

  const filtered = useMemo(() => {
    let result = campaigns;
    if (platformFilter !== "all") {
      result = result.filter((c) => c.platform === platformFilter);
    }
    return result.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [campaigns, sortField, sortDir, platformFilter]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function roasColor(roas: number): string {
    if (roas >= 3) return "text-success font-medium";
    if (roas < 1) return "text-danger font-medium";
    return "text-foreground";
  }

  const columns: { key: SortField; label: string; format: (v: CampaignRow) => string }[] = [
    { key: "campaign", label: "活動名稱", format: (r) => r.campaign },
    { key: "platform", label: "平台", format: (r) => r.platform },
    { key: "spend", label: "花費", format: (r) => formatCurrency(r.spend) },
    { key: "revenue", label: "營收", format: (r) => formatCurrency(r.revenue) },
    { key: "roas", label: "ROAS", format: (r) => formatRoas(r.roas) },
    { key: "conversions", label: "轉換", format: (r) => String(Math.round(r.conversions)) },
    { key: "cpc", label: "CPC", format: (r) => formatCurrency(r.cpc) },
    { key: "ctr", label: "CTR", format: (r) => formatCtr(r.ctr) },
  ];

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* 篩選列 */}
      <div className="p-4 border-b border-card-border flex items-center gap-3">
        <span className="text-sm text-muted">平台：</span>
        {["all", "Meta", "Google"].map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              platformFilter === p
                ? "bg-accent text-white"
                : "bg-gray-100 text-muted hover:text-foreground"
            }`}
          >
            {p === "all" ? "全部" : p}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted">
          共 {filtered.length} 個活動
        </span>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-card-border bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-left text-xs font-medium text-muted px-4 py-3 cursor-pointer hover:text-foreground select-none"
                >
                  {col.label}
                  {sortField === col.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.campaign}
                className="border-b border-card-border last:border-0 hover:bg-gray-50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm ${
                      col.key === "roas" ? roasColor(row.roas) : "text-foreground"
                    }`}
                  >
                    {col.format(row)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">
                  沒有符合條件的活動
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

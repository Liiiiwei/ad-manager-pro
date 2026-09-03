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
  const [searchQuery, setSearchQuery] = useState("");

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
    const query = searchQuery.trim().toLowerCase();
    let result = campaigns;
    if (query) {
      result = result.filter((c) => {
        return (
          c.campaign.toLowerCase().includes(query) ||
          c.platform.toLowerCase().includes(query)
        );
      });
    }
    return [...result].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [campaigns, sortField, sortDir, searchQuery]);

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
    <div className="bg-card border border-card-border rounded-xl overflow-hidden animate-fade-in">
      {/* 搜尋列 */}
      <div className="p-4 border-b border-card-border flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">廣告活動</p>
          <p className="text-xs text-muted mt-0.5">
            共 {filtered.length} 個活動
            {searchQuery.trim() && ` / 全部 ${campaigns.length} 個`}
          </p>
        </div>
        <div className="sm:ml-auto relative w-full sm:w-72">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋活動或平台"
            className="w-full rounded-lg border border-card-border bg-white py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
          />
        </div>
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
                      col.key === "campaign"
                        ? "text-foreground max-w-[320px] truncate"
                        : col.key === "roas"
                          ? `font-mono tabular-nums whitespace-nowrap ${roasColor(row.roas)}`
                          : typeof row[col.key] === "number"
                            ? "text-foreground font-mono tabular-nums whitespace-nowrap"
                            : "text-foreground whitespace-nowrap"
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

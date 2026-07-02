"use client";

import { useMemo } from "react";
import type { InitiativeRow } from "@/lib/initiatives/types";
import { formatCurrency, formatRoas } from "@/lib/utils/format";
import KpiCard from "@/components/dashboard/kpi-card";

interface InitiativeKpiCardsProps {
  rows: InitiativeRow[];
}

/** 行銷活動總覽的四張 KPI 卡：總花費 / 總預算 / 整體 ROAS / 整體 CPA */
export default function InitiativeKpiCards({ rows }: InitiativeKpiCardsProps) {
  const totals = useMemo(() => {
    let spend = 0;
    let revenue = 0;
    let conversions = 0;
    let budget = 0;
    for (const r of rows) {
      spend += r.spend;
      revenue += r.revenue;
      conversions += r.conversions;
      budget += r.budget;
    }
    return {
      spend,
      budget,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
    };
  }, [rows]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="總花費"
        value={formatCurrency(totals.spend)}
        iconBg="bg-accent-light text-accent"
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />
      <KpiCard
        title="總預算"
        value={totals.budget > 0 ? formatCurrency(totals.budget) : "—"}
        iconBg="bg-info/10 text-info"
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        }
      />
      <KpiCard
        title="整體 ROAS"
        value={formatRoas(totals.roas)}
        iconBg="bg-accent-light text-accent"
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        }
      />
      <KpiCard
        title="整體 CPA"
        value={totals.cpa > 0 ? formatCurrency(totals.cpa) : "—"}
        iconBg="bg-accent-light text-accent"
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        }
      />
    </div>
  );
}

"use client";

import { useState, useMemo, Fragment } from "react";
import type { InitiativeRow } from "@/lib/initiatives/types";
import { formatCurrency, formatRoas, formatNumber } from "@/lib/utils/format";

interface InitiativeTableProps {
  rows: InitiativeRow[];
}

type SortField = "spend" | "budget" | "roas" | "cpa" | "progress";

/** ROAS 顏色語意（≥3 佳、<1 警） */
function roasColor(roas: number): string {
  if (roas >= 3) return "text-success font-medium";
  if (roas < 1) return "text-danger font-medium";
  return "text-foreground";
}

/** 進度條顏色：超支紅、逼近橘、正常靛 */
function progressBarColor(progress: number): string {
  if (progress >= 1) return "bg-danger";
  if (progress >= 0.9) return "bg-warning";
  return "bg-accent";
}

/** 花費 / 預算的進度呈現（有 lifetime 顯示進度條、僅日預算顯示 chip、皆無顯示 —）*/
function BudgetCell({ row }: { row: InitiativeRow }) {
  if (row.hasBudget) {
    const pct = row.progress * 100;
    const clamped = Math.min(pct, 100);
    return (
      <div className="min-w-[140px]">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-mono tabular-nums text-foreground">
            {formatCurrency(row.spend)} / {formatCurrency(row.budget)}
          </span>
          <span className="font-mono tabular-nums text-muted ml-2">
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressBarColor(row.progress)}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    );
  }
  if (row.dailyBudget > 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-info/10 text-info text-xs px-2 py-0.5 font-mono tabular-nums">
        日預算 {formatCurrency(row.dailyBudget)}/天
      </span>
    );
  }
  return <span className="text-muted text-sm">—</span>;
}

export default function InitiativeTable({ rows }: InitiativeTableProps) {
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 依帳號分組，組內依排序欄位排序
  const groups = useMemo(() => {
    const byAccount = new Map<string, InitiativeRow[]>();
    for (const r of rows) {
      const list = byAccount.get(r.accountName);
      if (list) list.push(r);
      else byAccount.set(r.accountName, [r]);
    }
    const sortRows = (list: InitiativeRow[]) =>
      [...list].sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        return sortDir === "asc" ? av - bv : bv - av;
      });
    return [...byAccount.entries()]
      .map(([accountName, list]) => ({
        accountName,
        rows: sortRows(list),
        spend: list.reduce((s, r) => s + r.spend, 0),
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [rows, sortField, sortDir]);

  const columns: { key: SortField; label: string }[] = [
    { key: "spend", label: "花費" },
    { key: "budget", label: "花費 / 預算" },
    { key: "roas", label: "ROAS" },
    { key: "cpa", label: "CPA" },
  ];

  const totalCount = rows.length;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-card-border flex items-center">
        <span className="text-sm font-medium text-foreground">行銷活動</span>
        <span className="ml-auto text-sm text-muted">
          共 {totalCount} 個活動 · {groups.length} 個帳號
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-card-border bg-gray-50">
              <th className="text-left text-xs font-medium text-muted px-4 py-3 w-8" />
              <th className="text-left text-xs font-medium text-muted px-4 py-3">
                活動
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-left text-xs font-medium text-muted px-4 py-3 cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                >
                  {col.label}
                  {sortField === col.key && (
                    <span className="ml-1">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.accountName}>
                {/* 帳號分組列 */}
                <tr className="bg-gray-50/60 border-b border-card-border">
                  <td colSpan={2 + columns.length} className="px-4 py-2">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                      {group.accountName}
                    </span>
                    <span className="ml-2 text-xs text-muted font-mono tabular-nums">
                      {formatCurrency(group.spend)}
                    </span>
                  </td>
                </tr>

                {group.rows.map((row) => {
                  const isOpen = expanded.has(row.key);
                  return (
                    <Fragment key={row.key}>
                      <tr
                        onClick={() => toggle(row.key)}
                        className="border-b border-card-border hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-muted">
                          <svg
                            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground">
                            {row.prefix}
                          </div>
                          <div className="text-xs text-muted">
                            {row.platform} · {row.campaigns.length} 個 campaign
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">
                          {formatCurrency(row.spend)}
                        </td>
                        <td className="px-4 py-3">
                          <BudgetCell row={row} />
                        </td>
                        <td
                          className={`px-4 py-3 text-sm font-mono tabular-nums ${roasColor(row.roas)}`}
                        >
                          {formatRoas(row.roas)}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">
                          {row.cpa > 0 ? formatCurrency(row.cpa) : "—"}
                        </td>
                      </tr>

                      {/* 展開：campaign 明細 */}
                      {isOpen &&
                        row.campaigns.map((c) => (
                          <tr
                            key={`${row.key}::${c.campaign}`}
                            className="border-b border-card-border bg-gray-50/40"
                          >
                            <td />
                            <td className="px-4 py-2 pl-8">
                              <div className="text-xs text-foreground truncate max-w-xs">
                                {c.campaign}
                              </div>
                              <div className="text-[11px] text-muted">
                                {formatNumber(c.conversions)} 轉換
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs font-mono tabular-nums text-muted">
                              {formatCurrency(c.spend)}
                            </td>
                            <td className="px-4 py-2 text-xs font-mono tabular-nums text-muted">
                              {c.lifetimeBudget > 0
                                ? formatCurrency(c.lifetimeBudget)
                                : c.dailyBudget > 0
                                  ? `${formatCurrency(c.dailyBudget)}/天`
                                  : "—"}
                            </td>
                            <td
                              className={`px-4 py-2 text-xs font-mono tabular-nums ${roasColor(c.roas)}`}
                            >
                              {formatRoas(c.roas)}
                            </td>
                            <td className="px-4 py-2 text-xs font-mono tabular-nums text-muted">
                              {c.cpa > 0 ? formatCurrency(c.cpa) : "—"}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
            {totalCount === 0 && (
              <tr>
                <td
                  colSpan={2 + columns.length}
                  className="px-4 py-8 text-center text-sm text-muted"
                >
                  沒有符合條件的行銷活動
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

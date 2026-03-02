"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Alert, AlertCategory, AlertSeverity } from "@/lib/analysis/types";
import AlertCard from "./alert-card";

interface AlertListProps {
  alerts: Alert[];
}

const RESOLVED_KEY = "resolved_alerts";

function getResolvedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(RESOLVED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveResolvedIds(ids: Set<string>) {
  localStorage.setItem(RESOLVED_KEY, JSON.stringify([...ids]));
}

export default function AlertList({ alerts }: AlertListProps) {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    setResolvedIds(getResolvedIds());
  }, []);

  const handleResolve = useCallback((id: string) => {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveResolvedIds(next);
      return next;
    });
  }, []);

  const handleUnresolve = useCallback((id: string) => {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveResolvedIds(next);
      return next;
    });
  }, []);

  const resolvedCount = useMemo(() => {
    return alerts.filter((a) => resolvedIds.has(a.id)).length;
  }, [alerts, resolvedIds]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      // 已解決篩選
      const isResolved = resolvedIds.has(a.id);
      if (!showResolved && isResolved) return false;
      if (showResolved && !isResolved) return false;

      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;

      return true;
    });
  }, [alerts, categoryFilter, severityFilter, resolvedIds, showResolved]);

  const categories: { key: AlertCategory | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "budget", label: "預算" },
    { key: "performance", label: "成效" },
    { key: "creative", label: "素材" },
    { key: "recommendation", label: "建議" },
  ];

  const severities: { key: AlertSeverity | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "critical", label: "嚴重" },
    { key: "warning", label: "警告" },
    { key: "info", label: "建議" },
  ];

  return (
    <div>
      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">類別：</span>
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                categoryFilter === c.key
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-muted hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">嚴重度：</span>
          {severities.map((s) => (
            <button
              key={s.key}
              onClick={() => setSeverityFilter(s.key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                severityFilter === s.key
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 已解決切換列 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowResolved(!showResolved)}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            showResolved
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-white border-card-border text-muted hover:text-foreground"
          }`}
        >
          {showResolved ? `查看已解決 (${resolvedCount})` : `未解決警示`}
          {!showResolved && resolvedCount > 0 && (
            <span className="ml-1.5 text-xs text-green-600">({resolvedCount} 已解決)</span>
          )}
        </button>

        <span className="text-sm text-muted">
          {filtered.length} 則{showResolved ? "已解決" : ""}警示
        </span>
      </div>

      {/* 警示列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted">
          {showResolved ? "沒有已解決的警示" : "沒有符合條件的警示"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onResolve={showResolved ? handleUnresolve : handleResolve}
              isResolved={showResolved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

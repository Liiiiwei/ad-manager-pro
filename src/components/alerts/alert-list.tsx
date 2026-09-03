"use client";

import { useState, useMemo } from "react";
import type { Alert, AlertCategory, AlertSeverity } from "@/lib/analysis/types";
import { alertStableKey } from "@/lib/analysis/alert-key";
import { useResolvedAlerts } from "@/hooks/use-resolved-alerts";
import AlertCard from "./alert-card";

interface AlertListProps {
  alerts: Alert[];
}

const severityRank: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  good: 3, // 正向通知排最後，讓待處理問題先浮上來
};

export default function AlertList({ alerts }: AlertListProps) {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">(
    "all",
  );
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">(
    "all",
  );
  const [showResolved, setShowResolved] = useState(false);

  // 已處理狀態改由 DB 持久化（跨重算、重整、換裝置保留）
  const {
    resolvedKeys,
    error: resolvedError,
    resolve,
    unresolve,
  } = useResolvedAlerts();

  const isResolved = (a: Alert) => resolvedKeys.has(alertStableKey(a));

  const resolvedCount = useMemo(
    () => alerts.filter(isResolved).length,
    [alerts, resolvedKeys],
  );

  const openCount = alerts.length - resolvedCount;
  const criticalCount = useMemo(
    () =>
      alerts.filter((a) => !isResolved(a) && a.severity === "critical").length,
    [alerts, resolvedKeys],
  );
  const warningCount = useMemo(
    () =>
      alerts.filter((a) => !isResolved(a) && a.severity === "warning").length,
    [alerts, resolvedKeys],
  );
  const goodCount = useMemo(
    () => alerts.filter((a) => !isResolved(a) && a.severity === "good").length,
    [alerts, resolvedKeys],
  );

  const filtered = useMemo(() => {
    return alerts
      .filter((a) => {
        const resolved = isResolved(a);
        if (!showResolved && resolved) return false;
        if (showResolved && !resolved) return false;

        if (categoryFilter !== "all" && a.category !== categoryFilter)
          return false;
        if (severityFilter !== "all" && a.severity !== severityFilter)
          return false;

        return true;
      })
      .sort((a, b) => {
        const severityDiff =
          severityRank[a.severity] - severityRank[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      });
  }, [alerts, categoryFilter, severityFilter, resolvedKeys, showResolved]);

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
    { key: "good", label: "表現良好" },
  ];

  const hasActiveFilter = categoryFilter !== "all" || severityFilter !== "all";
  const emptyText = hasActiveFilter
    ? "沒有符合篩選條件的警示"
    : showResolved
      ? "尚無已處理警示"
      : "目前沒有待處理警示";

  return (
    <div className="space-y-4">
      {/* 工作佇列表頭 */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">警示待辦</p>
            <p className="text-xs text-muted mt-1">
              依嚴重度與變化幅度排序，先處理影響最大的問題。
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "未處理", value: openCount, tone: "text-foreground" },
              { label: "嚴重", value: criticalCount, tone: "text-danger" },
              { label: "警告", value: warningCount, tone: "text-warning" },
              { label: "表現良好", value: goodCount, tone: "text-success" },
              { label: "已處理", value: resolvedCount, tone: "text-muted" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-card-border bg-background/60 px-3 py-2"
              >
                <p className="text-[11px] text-muted">{item.label}</p>
                <p
                  className={`text-lg font-semibold font-mono tabular-nums ${item.tone}`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {resolvedError && (
          <p className="mt-3 text-xs text-danger">{resolvedError}</p>
        )}

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setShowResolved(false)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                !showResolved
                  ? "bg-card shadow-sm font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              未處理
            </button>
            <button
              onClick={() => setShowResolved(true)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                showResolved
                  ? "bg-card shadow-sm font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              已處理
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted mr-1">類別</span>
              {categories.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    categoryFilter === c.key
                      ? "bg-accent text-white"
                      : "bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted mr-1">嚴重度</span>
              {severities.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSeverityFilter(s.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    severityFilter === s.key
                      ? "bg-accent text-white"
                      : "bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 警示列表 */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl text-center py-12 text-sm text-muted">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const key = alertStableKey(alert);
            return (
              <AlertCard
                key={alert.id}
                alert={alert}
                onResolve={
                  showResolved ? () => unresolve(key) : () => resolve(key)
                }
                isResolved={showResolved}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

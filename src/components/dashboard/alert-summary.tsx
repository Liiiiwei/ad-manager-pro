"use client";

import Link from "next/link";
import type { Alert, AlertSeverity } from "@/lib/analysis/types";
import { alertStableKey } from "@/lib/analysis/alert-key";
import { useResolvedAlerts } from "@/hooks/use-resolved-alerts";

interface AlertSummaryProps {
  alerts: Alert[];
  loading?: boolean;
  error?: string | null;
}

const severityColors: Record<AlertSeverity, string> = {
  critical: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  // 正向通知（表現良好）：綠色 success token
  good: "bg-success/10 border-success/30 text-success",
};

const severityDots: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  good: "bg-success",
};

export default function AlertSummary({
  alerts,
  loading,
  error,
}: AlertSummaryProps) {
  // 已處理狀態改由 DB 持久化；儀表板也可就地標記完成
  const { resolvedKeys, resolve } = useResolvedAlerts();

  // 排除已處理，未處理的才顯示與計數
  const visibleAlerts = alerts.filter(
    (a) => !resolvedKeys.has(alertStableKey(a)),
  );

  const criticalCount = visibleAlerts.filter(
    (a) => a.severity === "critical",
  ).length;
  const warningCount = visibleAlerts.filter(
    (a) => a.severity === "warning",
  ).length;
  const goodCount = visibleAlerts.filter((a) => a.severity === "good").length;

  // 依帳號分組警示
  const alertsByAccount = visibleAlerts.reduce(
    (acc, alert) => {
      const account = alert.accountName || "未分類";
      if (!acc[account]) {
        acc[account] = [];
      }
      acc[account].push(alert);
      return acc;
    },
    {} as Record<string, Alert[]>,
  );

  const accountEntries = Object.entries(alertsByAccount).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">最佳化警示</h3>
        <div className="flex items-center gap-3 text-xs">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-danger font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {criticalCount} 嚴重
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-warning font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {warningCount} 警告
            </span>
          )}
          {goodCount > 0 && (
            <span className="flex items-center gap-1 text-success font-medium">
              <span className="w-2 h-2 rounded-full bg-success" />
              {goodCount} 表現良好
            </span>
          )}
          <Link href="/alerts" className="text-accent hover:underline">
            查看全部
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted py-4 text-center">警示分析載入中...</p>
      ) : error ? (
        <p className="text-sm text-danger py-4 text-center">
          警示分析載入失敗，請稍後重試
        </p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">目前沒有警示</p>
      ) : visibleAlerts.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">所有警示都已處理</p>
      ) : (
        <div className="space-y-4">
          {accountEntries.map(([account, accountAlerts]) => (
            <div key={account} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">
                {account}
              </h4>
              <div className="space-y-2">
                {accountAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${severityColors[alert.severity]}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDots[alert.severity]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {alert.title}
                      </p>
                      <p className="text-xs opacity-80 mt-0.5 line-clamp-1">
                        {alert.recommendation}
                      </p>
                    </div>
                    <button
                      onClick={() => resolve(alertStableKey(alert))}
                      className="shrink-0 text-[11px] px-2 py-0.5 rounded-md border border-card-border bg-card/70 text-muted transition-colors hover:text-success hover:border-success/40"
                      title="標記為已處理"
                    >
                      完成
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

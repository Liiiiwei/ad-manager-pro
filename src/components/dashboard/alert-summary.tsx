import Link from "next/link";
import type { Alert } from "@/lib/analysis/types";

interface AlertSummaryProps {
  alerts: Alert[];
}

const severityColors = {
  critical: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const severityDots = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function AlertSummary({ alerts }: AlertSummaryProps) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  // 依帳號分組警示
  const alertsByAccount = alerts.reduce((acc, alert) => {
    const account = alert.accountName || "未分類";
    if (!acc[account]) {
      acc[account] = [];
    }
    acc[account].push(alert);
    return acc;
  }, {} as Record<string, Alert[]>);

  // 每個帳號取前 3 個警示
  const accountEntries = Object.entries(alertsByAccount)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">最佳化警示</h3>
        <div className="flex items-center gap-3 text-xs">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {criticalCount} 嚴重
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {warningCount} 警告
            </span>
          )}
          <Link href="/alerts" className="text-accent hover:underline">
            查看全部
          </Link>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">目前沒有警示</p>
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
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDots[alert.severity]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      <p className="text-xs opacity-80 mt-0.5 line-clamp-1">
                        {alert.recommendation}
                      </p>
                    </div>
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

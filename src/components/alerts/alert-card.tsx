import type { Alert } from "@/lib/analysis/types";
import { formatPercent } from "@/lib/utils/format";

interface AlertCardProps {
  alert: Alert;
  onResolve?: (id: string) => void;
  isResolved?: boolean;
}

const severityConfig = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    label: "嚴重",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    label: "警告",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    label: "建議",
  },
};

const categoryLabels: Record<string, string> = {
  budget: "預算",
  performance: "成效",
  creative: "素材",
  recommendation: "建議",
};

export default function AlertCard({ alert, onResolve, isResolved }: AlertCardProps) {
  const config = severityConfig[alert.severity];

  return (
    <div className={`${config.bg} border ${config.border} rounded-xl p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
            {config.label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {categoryLabels[alert.category]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {alert.platform === "meta" ? "Meta" : alert.platform === "google" ? "Google" : "全平台"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {alert.changePercent !== 0 && (
            <span
              className={`text-sm font-semibold ${
                alert.changePercent > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {formatPercent(alert.changePercent)}
            </span>
          )}
          {onResolve && (
            <button
              onClick={() => onResolve(alert.id)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                isResolved
                  ? "bg-green-50 border-green-200 text-green-600 hover:bg-white hover:border-gray-200 hover:text-muted"
                  : "bg-white/80 border-gray-200 text-muted hover:text-green-600 hover:border-green-300 hover:bg-green-50"
              }`}
              title={isResolved ? "恢復為未解決" : "標記為已解決"}
            >
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isResolved ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  )}
                </svg>
                {isResolved ? "恢復" : "已解決"}
              </span>
            </button>
          )}
        </div>
      </div>

      <h4 className="text-sm font-semibold text-foreground mb-1">{alert.title}</h4>
      <p className="text-xs text-muted mb-3">{alert.description}</p>

      <div className="bg-white/60 rounded-lg p-3">
        <p className="text-xs font-medium text-foreground mb-0.5">建議行動</p>
        <p className="text-xs text-muted">{alert.recommendation}</p>
      </div>

      <p className="text-xs text-muted mt-2">偵測日期: {alert.detectedAt}</p>
    </div>
  );
}

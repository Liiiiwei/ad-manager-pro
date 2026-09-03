import type { Alert } from "@/lib/analysis/types";
import { formatPercent } from "@/lib/utils/format";

interface AlertCardProps {
  alert: Alert;
  // 由父層綁定 alertStableKey 後呼叫，卡片本身不需知道鍵值
  onResolve?: () => void;
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
  // 正向通知（表現良好）：綠色 success token，與紅／琥珀的問題警示區隔
  good: {
    bg: "bg-success/10",
    border: "border-success/30",
    badge: "bg-success/15 text-success",
    label: "表現良好",
  },
};

const categoryLabels: Record<string, string> = {
  budget: "預算",
  performance: "成效",
  creative: "素材",
  recommendation: "建議",
};

export default function AlertCard({
  alert,
  onResolve,
  isResolved,
}: AlertCardProps) {
  const config = severityConfig[alert.severity];
  const targetLabel =
    alert.campaignName ?? alert.adsetName ?? alert.adName ?? "全帳號";
  const changeTone =
    alert.changePercent > 0
      ? "text-danger"
      : alert.changePercent < 0
        ? "text-success"
        : "text-muted";

  return (
    <div className={`${config.bg} border ${config.border} rounded-xl p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}
            >
              {config.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-card/80 text-muted">
              {categoryLabels[alert.category]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-card/80 text-muted">
              {alert.platform === "meta"
                ? "Meta"
                : alert.platform === "google"
                  ? "Google"
                  : "全平台"}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">
            {alert.title}
          </h4>
          <p className="text-xs text-muted">
            {alert.accountName ?? "未分類帳號"} · {targetLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:justify-end">
          {alert.changePercent !== 0 && (
            <span
              className={`text-sm font-semibold font-mono tabular-nums ${changeTone}`}
            >
              {formatPercent(alert.changePercent)}
            </span>
          )}
          {onResolve && (
            <button
              onClick={() => onResolve()}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                isResolved
                  ? "bg-green-50 border-green-200 text-green-600 hover:bg-white hover:border-gray-200 hover:text-muted"
                  : "bg-white/80 border-gray-200 text-muted hover:text-green-600 hover:border-green-300 hover:bg-green-50"
              }`}
              title={isResolved ? "恢復為未解決" : "標記為已解決"}
            >
              <span className="flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isResolved ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  )}
                </svg>
                {isResolved ? "恢復未處理" : "標記完成"}
              </span>
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted mt-3 mb-3">{alert.description}</p>

      <div className="bg-white/60 rounded-lg p-3">
        <p className="text-xs font-medium text-foreground mb-0.5">建議行動</p>
        <p className="text-xs text-muted">{alert.recommendation}</p>
      </div>

      <p className="text-xs text-muted mt-2">偵測日期：{alert.detectedAt}</p>
    </div>
  );
}

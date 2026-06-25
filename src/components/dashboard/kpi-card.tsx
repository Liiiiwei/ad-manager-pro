import type { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string;
  icon?: ReactNode;
  iconBg?: string;
  change?: number;
  changeLabel?: string;
}

export default function KpiCard({
  title,
  value,
  icon,
  iconBg = "bg-accent-light text-accent",
  change,
  changeLabel,
}: KpiCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 card-hover animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground truncate font-mono tabular-nums">
            {value}
          </p>
          {change !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                  isPositive
                    ? "bg-green-50 text-success"
                    : isNegative
                      ? "bg-red-50 text-danger"
                      : "bg-gray-50 text-muted"
                }`}
              >
                {isPositive && (
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                )}
                {isNegative && (
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                )}
                {isPositive ? "+" : ""}
                {change.toFixed(1)}%
              </span>
              {changeLabel && (
                <span className="text-[11px] text-muted">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

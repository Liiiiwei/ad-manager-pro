interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
}

export default function KpiCard({ title, value, change, changeLabel }: KpiCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <p className="text-sm text-muted mb-1">{title}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          <span
            className={`text-sm font-medium ${
              isPositive ? "text-success" : isNegative ? "text-danger" : "text-muted"
            }`}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-muted">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

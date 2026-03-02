"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { WindsorAdRecord } from "@/lib/windsor/types";

interface SpendChartProps {
  data: WindsorAdRecord[];
}

export default function SpendChart({ data }: SpendChartProps) {
  // 依日期聚合花費和營收
  const chartData = aggregateByDate(data);

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-5">
        <p className="text-sm text-muted">尚無資料</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">花費 vs 營收趨勢</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="spend"
            stroke="#ef4444"
            name="花費"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#22c55e"
            name="營收"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function aggregateByDate(data: WindsorAdRecord[]) {
  const map: Record<string, { date: string; spend: number; revenue: number }> = {};

  for (const record of data) {
    if (!map[record.date]) {
      map[record.date] = { date: record.date, spend: 0, revenue: 0 };
    }
    map[record.date].spend += record.spend;
    map[record.date].revenue += record.revenue;
  }

  return Object.values(map).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

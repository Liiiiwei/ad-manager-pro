"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { WindsorAdRecord } from "@/lib/windsor/types";

interface RoasChartProps {
  data: WindsorAdRecord[];
  roasThreshold?: number;
}

export default function RoasChart({ data, roasThreshold = 1.5 }: RoasChartProps) {
  const chartData = aggregateRoasByDate(data);

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-5 card-hover">
        <p className="text-sm text-muted">尚無資料</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 card-hover">
      <h3 className="text-sm font-semibold text-foreground mb-4">每日 ROAS 與訂單數趨勢</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={(v) => `${v}x`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={(v) => Math.round(v).toString()}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "ROAS") return [`${value.toFixed(2)}x`, "ROAS"];
              return [Math.round(value), "訂單數"];
            }}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="line"
          />
          <ReferenceLine
            yAxisId="left"
            y={roasThreshold}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: `虧損線 ${roasThreshold}x`, fill: "#ef4444", fontSize: 11 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="roas"
            stroke="#3b82f6"
            name="ROAS"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="orders"
            stroke="#10b981"
            name="訂單數"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function aggregateRoasByDate(data: WindsorAdRecord[]) {
  const map: Record<string, { date: string; spend: number; revenue: number; orders: number }> = {};

  for (const record of data) {
    if (!map[record.date]) {
      map[record.date] = { date: record.date, spend: 0, revenue: 0, orders: 0 };
    }
    map[record.date].spend += record.spend;
    map[record.date].revenue += record.revenue;
    map[record.date].orders += record.conversions;
  }

  return Object.values(map)
    .map((d) => ({
      date: d.date,
      roas: d.spend > 0 ? d.revenue / d.spend : 0,
      orders: d.orders,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

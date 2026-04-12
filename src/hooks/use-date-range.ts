"use client";

import { useState } from "react";

export function useDateRange() {
  const [dateRange, setDateRange] = useState("last_7d");
  const [includeToday, setIncludeToday] = useState(false);
  return { dateRange, setDateRange, includeToday, setIncludeToday };
}

/** 將 base dateRange + includeToday 組合成 Windsor 實際使用的 date_preset */
export function resolveDatePreset(
  dateRange: string,
  includeToday: boolean,
): string {
  if (!includeToday) return dateRange;
  // Windsor 的「包含今天」變體：last_7d → last_7dT
  if (/^last_\d+[dwmy]$/.test(dateRange)) return `${dateRange}T`;
  if (dateRange === "last_year" || dateRange === "last_2years") {
    return `${dateRange}T`;
  }
  if (dateRange === "this_month" || dateRange === "this_year") {
    return `${dateRange}T`;
  }
  return dateRange;
}

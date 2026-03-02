"use client";

import { useState } from "react";

export function useDateRange() {
  const [dateRange, setDateRange] = useState("last_7d");
  return { dateRange, setDateRange };
}

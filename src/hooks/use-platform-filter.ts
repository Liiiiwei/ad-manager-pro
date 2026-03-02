"use client";

import { useState } from "react";

export type Platform = "all" | "meta" | "google";

export function usePlatformFilter() {
  const [platform, setPlatform] = useState<Platform>("all");
  return { platform, setPlatform };
}

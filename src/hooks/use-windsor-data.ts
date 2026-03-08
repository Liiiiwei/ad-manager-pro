"use client";

import { useState, useEffect, useCallback } from "react";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AnalysisResult } from "@/lib/analysis/types";

/** 從 localStorage 取得 API Key（僅限非 SSR 環境直接呼叫） */
export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("windsor_api_key");
}

/** 用 hook 安全地讀取 API Key，避免 SSR hydration 不匹配 */
export function useApiKey(): { apiKey: string | null; ready: boolean } {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setApiKeyState(localStorage.getItem("windsor_api_key"));
    setReady(true);
  }, []);

  return { apiKey, ready };
}

/** 儲存 API Key 到 localStorage */
export function setApiKey(key: string): void {
  localStorage.setItem("windsor_api_key", key);
}

/** 清除 API Key */
export function clearApiKey(): void {
  localStorage.removeItem("windsor_api_key");
}

/** 取得 Windsor 廣告資料 */
export function useWindsorData(dateRange: string, platform: string) {
  const [data, setData] = useState<WindsorAdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("請先在 Settings 頁面設定 Windsor API Key");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const connector =
        platform === "meta" ? "facebook" : platform === "google" ? "google_ads" : "all";

      const res = await fetch(
        `/api/windsor?connector=${connector}&dateRange=${dateRange}`,
        {
          headers: { "x-windsor-api-key": apiKey },
        },
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "取得資料失敗");
      }

      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, [dateRange, platform]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/** 取得分析結果 */
export function useAnalysis(dateRange: string) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("請先在 Settings 頁面設定 Windsor API Key");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analyze?dateRange=${dateRange}`, {
        headers: { "x-windsor-api-key": apiKey },
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "分析失敗");
      }

      const json = await res.json();
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return { result, loading, error, refetch: fetchAnalysis };
}

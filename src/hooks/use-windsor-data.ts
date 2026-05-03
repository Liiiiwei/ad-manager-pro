"use client";

import { useState, useEffect, useCallback } from "react";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AnalysisResult } from "@/lib/analysis/types";

/**
 * 檢查使用者是否已設定 Windsor API Key（透過 /api/settings GET）
 * 不回傳實際 key 值，僅回傳布林值供 UI 門控使用
 */
export function useApiKey(): { hasApiKey: boolean; ready: boolean } {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) {
          setHasApiKey(false);
          return;
        }
        const json = await res.json();
        // settings GET 回傳遮罩後的 key，有值代表已設定
        setHasApiKey(!!json.windsor?.apiKey);
      } catch {
        setHasApiKey(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hasApiKey, ready };
}

/** 取得 Windsor 廣告資料 */
export function useWindsorData(dateRange: string, platform: string) {
  const [data, setData] = useState<WindsorAdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const connector =
        platform === "meta"
          ? "facebook"
          : platform === "google"
            ? "google_ads"
            : "all";

      const res = await fetch(
        `/api/windsor?connector=${connector}&dateRange=${dateRange}`,
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
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analyze?dateRange=${dateRange}`);

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

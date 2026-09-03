"use client";

import { useState, useEffect, useCallback } from "react";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AnalysisResult } from "@/lib/analysis/types";

const inFlightRequests = new Map<string, Promise<unknown>>();

async function fetchJsonOnce<T>(url: string): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) return existing as Promise<T>;

  const request = fetch(url)
    .then(async (res) => {
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "請求失敗");
      }
      return body as T;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, request);
  return request;
}

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
        const json = await fetchJsonOnce<{ windsor?: { apiKey?: string } }>(
          "/api/settings",
        );
        // settings GET 回傳遮罩後的 key，有值代表已設定
        if (!cancelled) setHasApiKey(!!json.windsor?.apiKey);
      } catch {
        if (!cancelled) setHasApiKey(false);
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

/** 取得 Windsor 廣告資料（level 可選：campaign 預設、initiative 會多帶預算欄位）*/
export function useWindsorData(
  dateRange: string,
  platform: string,
  level?: string,
) {
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

      const levelParam = level ? `&level=${level}` : "";
      const url = `/api/windsor?connector=${connector}&dateRange=${dateRange}${levelParam}`;
      const json = await fetchJsonOnce<{ data?: WindsorAdRecord[] }>(url);
      setData(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, [dateRange, platform, level]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const connector =
          platform === "meta"
            ? "facebook"
            : platform === "google"
              ? "google_ads"
              : "all";

        const levelParam = level ? `&level=${level}` : "";
        const url = `/api/windsor?connector=${connector}&dateRange=${dateRange}${levelParam}`;
        const json = await fetchJsonOnce<{ data?: WindsorAdRecord[] }>(url);
        if (!cancelled) setData(json.data || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "未知錯誤");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [dateRange, platform, level]);

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
      const json = await fetchJsonOnce<AnalysisResult>(
        `/api/analyze?dateRange=${dateRange}`,
      );
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const json = await fetchJsonOnce<AnalysisResult>(
          `/api/analyze?dateRange=${dateRange}`,
        );
        if (!cancelled) setResult(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "未知錯誤");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  return { result, loading, error, refetch: fetchAnalysis };
}

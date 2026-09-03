"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * 管理「已處理」警示狀態（DB 持久化）。
 * 以 alertStableKey（內容穩定鍵）識別，跨重新分析、重整、換裝置都保留標記。
 */
export function useResolvedAlerts() {
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初次載入：抓目前使用者所有已處理的 key
  const fetchResolved = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/resolved");
      if (!res.ok) {
        setError("無法載入已處理狀態");
        return;
      }
      const json = await res.json();
      setError(null);
      setResolvedKeys(new Set<string>(json.keys ?? []));
    } catch {
      setError("無法載入已處理狀態");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    fetchResolved();
  }, [fetchResolved]);

  // 標記已處理（樂觀更新 + 失敗回滾）
  const resolve = useCallback(async (key: string) => {
    let rolledBack = false;
    setResolvedKeys((prev) => {
      if (prev.has(key)) {
        rolledBack = true; // 已存在，無需送請求
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (rolledBack) return;

    try {
      const res = await fetch("/api/alerts/resolved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertKey: key }),
      });
      if (!res.ok) {
        // 失敗回滾
        setResolvedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setError("標記已處理失敗");
      }
    } catch {
      setResolvedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setError("標記已處理失敗");
    }
  }, []);

  // 取消已處理（樂觀更新 + 失敗回滾）
  const unresolve = useCallback(async (key: string) => {
    let rolledBack = false;
    setResolvedKeys((prev) => {
      if (!prev.has(key)) {
        rolledBack = true; // 本來就不在，無需送請求
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (rolledBack) return;

    try {
      const res = await fetch("/api/alerts/resolved", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertKey: key }),
      });
      if (!res.ok) {
        setResolvedKeys((prev) => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
        setError("取消已處理失敗");
      }
    } catch {
      setResolvedKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setError("取消已處理失敗");
    }
  }, []);

  return { resolvedKeys, ready, error, resolve, unresolve };
}

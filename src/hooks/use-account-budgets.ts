"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * 帳號手動月預算：掛載時從 GET /api/settings 載入，
 * saveBudget 以 PATCH merge 語意逐 key 儲存（value 為 null 表清除）。
 * 載入失敗時維持空物件（畫面與未設定時相同），不阻塞主資料呈現。
 */
export function useAccountBudgets() {
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.accountBudgets) {
          setBudgets(json.accountBudgets);
        }
      } catch {
        // 載入失敗時維持空物件，卡片落回 API 預算邏輯
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 儲存單一帳號月預算；value 為 null 表清除。回傳是否成功。 */
  const saveBudget = useCallback(
    async (accountName: string, value: number | null): Promise<boolean> => {
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountBudgets: { [accountName]: value } }),
        });
        if (!res.ok) return false;
        setBudgets((prev) => {
          const next = { ...prev };
          if (value === null) {
            delete next[accountName];
          } else {
            next[accountName] = value;
          }
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return { budgets, saveBudget };
}

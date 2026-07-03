"use client";

import type { AccountSummary } from "@/lib/initiatives/types";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency } from "@/lib/utils/format";

interface AccountPacingCardsProps {
  accounts: AccountSummary[];
  selectedAccounts: string[];
  onAccountsChange: (accounts: string[]) => void;
}

/** 帳號預算配速卡片區：每帳號一張卡，點擊切換「只看該帳號」篩選 */
export default function AccountPacingCards({
  accounts,
  selectedAccounts,
  onAccountsChange,
}: AccountPacingCardsProps) {
  if (accounts.length === 0) return null;

  // 全部帳號都無進行中預算 → 整區收合成一行提示
  if (!accounts.some((a) => a.hasBudget)) {
    return (
      <p className="text-sm text-muted">
        所有帳號目前皆無進行中的活動預算，無法推算期間預算進度。
      </p>
    );
  }

  const isOnly = (name: string) =>
    selectedAccounts.length === 1 && selectedAccounts[0] === name;

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">帳號預算進度</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {accounts.map((a) => {
          const level = pacingLevel(a.progress);
          const pct = a.progress * 100;
          const selected = isOnly(a.accountName);
          return (
            <button
              key={a.accountName}
              type="button"
              onClick={() => onAccountsChange(selected ? [] : [a.accountName])}
              className={`text-left bg-card border rounded-xl p-4 transition-all card-hover ${
                selected
                  ? "border-accent ring-1 ring-accent"
                  : "border-card-border"
              }`}
            >
              <div className="text-xs text-muted truncate mb-1">
                {a.accountName}
              </div>
              {a.hasBudget ? (
                <>
                  <div
                    className={`text-2xl font-semibold font-mono tabular-nums ${PACING_TEXT[level]}`}
                  >
                    {pct.toFixed(0)}%
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-background overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full ${PACING_BG[level]}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted font-mono tabular-nums mt-1.5">
                    {formatCurrency(a.spend)} / {formatCurrency(a.periodBudget)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-muted">
                    —
                  </div>
                  <div className="text-[11px] text-muted mt-1.5">
                    無進行中預算 · 花費 {formatCurrency(a.spend)}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

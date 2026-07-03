"use client";

import { useState } from "react";
import type { AccountSummary } from "@/lib/initiatives/types";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency } from "@/lib/utils/format";

interface AccountPacingCardsProps {
  accounts: AccountSummary[];
  selectedAccounts: string[];
  onAccountsChange: (accounts: string[]) => void;
  /** 儲存帳號手動月預算；value 為 null 表清除，回傳是否成功 */
  onSaveBudget: (accountName: string, value: number | null) => Promise<boolean>;
}

/**
 * 帳號預算配速卡片區：每帳號一張卡，點擊切換「只看該帳號」篩選；
 * hover 鉛筆鈕可就地編輯手動月預算（優先於 API 推算值）。
 */
export default function AccountPacingCards({
  accounts,
  selectedAccounts,
  onAccountsChange,
  onSaveBudget,
}: AccountPacingCardsProps) {
  // 就地編輯狀態（同時間只開一張卡）
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const isOnly = (name: string) =>
    selectedAccounts.length === 1 && selectedAccounts[0] === name;

  const startEdit = (a: AccountSummary) => {
    setEditing(a.accountName);
    setInputValue(
      a.budgetSource === "manual" ? String(a.monthlyBudget ?? "") : "",
    );
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setInputValue("");
    setEditError(null);
  };

  const handleSave = async (accountName: string) => {
    const trimmed = inputValue.trim();
    // 空值視為取消
    if (trimmed === "") {
      closeEdit();
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) {
      setEditError("請輸入大於 0、不超過 10 億的數字");
      return;
    }
    setSaving(true);
    setEditError(null);
    const ok = await onSaveBudget(accountName, value);
    setSaving(false);
    if (ok) closeEdit();
    else setEditError("儲存失敗，請重試");
  };

  const handleClear = async (accountName: string) => {
    setSaving(true);
    setEditError(null);
    const ok = await onSaveBudget(accountName, null);
    setSaving(false);
    if (ok) closeEdit();
    else setEditError("清除失敗，請重試");
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">帳號預算進度</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {accounts.map((a) => {
          const level = pacingLevel(a.progress);
          const pct = a.progress * 100;
          const selected = isOnly(a.accountName);
          const isEditing = editing === a.accountName;
          return (
            <div
              key={a.accountName}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isEditing) return;
                onAccountsChange(selected ? [] : [a.accountName]);
              }}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAccountsChange(selected ? [] : [a.accountName]);
                }
              }}
              className={`group relative text-left cursor-pointer bg-card border rounded-xl p-4 transition-all card-hover ${
                selected
                  ? "border-accent ring-1 ring-accent"
                  : "border-card-border"
              }`}
            >
              {!isEditing && (
                <button
                  type="button"
                  aria-label={`編輯 ${a.accountName} 的月預算`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(a);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-md text-muted hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
                    />
                  </svg>
                </button>
              )}
              <div className="text-xs text-muted truncate mb-1 pr-6">
                {a.accountName}
              </div>
              {isEditing ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="number"
                    autoFocus
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(a.accountName);
                      if (e.key === "Escape") closeEdit();
                    }}
                    placeholder="月預算（原幣別）"
                    disabled={saving}
                    className="w-full text-sm font-mono tabular-nums bg-background border border-card-border rounded-md px-2 py-1 focus:outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSave(a.accountName)}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {saving ? "儲存中…" : "儲存"}
                    </button>
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 rounded-md text-muted hover:text-foreground disabled:opacity-50"
                    >
                      取消
                    </button>
                    {a.budgetSource === "manual" && (
                      <button
                        type="button"
                        onClick={() => handleClear(a.accountName)}
                        disabled={saving}
                        className="text-[11px] px-2 py-0.5 rounded-md text-danger disabled:opacity-50 ml-auto"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  {editError && (
                    <p className="text-[11px] text-danger mt-1">{editError}</p>
                  )}
                </div>
              ) : a.hasBudget ? (
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
                  {a.budgetSource === "manual" && (
                    <div className="text-[11px] text-muted font-mono tabular-nums mt-0.5">
                      月預算 {formatCurrency(a.monthlyBudget ?? 0)}
                    </div>
                  )}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

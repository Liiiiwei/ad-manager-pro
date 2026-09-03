"use client";

import { useState, useRef, useEffect } from "react";

interface AccountFilterProps {
  accounts: string[];
  selected: string[];
  onChange: (accounts: string[]) => void;
}

export default function AccountFilter({
  accounts,
  selected,
  onChange,
}: AccountFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉下拉選單（必須在條件 return 之前呼叫）
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (accounts.length <= 1) return null;

  const handleToggle = (account: string) => {
    if (selected.includes(account)) {
      onChange(selected.filter((a) => a !== account));
    } else {
      onChange([...selected, account]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === accounts.length) {
      onChange([]);
    } else {
      onChange([...accounts]);
    }
  };

  const displayText =
    selected.length === 0
      ? "未選擇帳號"
      : selected.length === accounts.length
        ? "全部帳號"
        : `已選 ${selected.length} 個帳號`;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">帳號：</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-sm border border-card-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent flex items-center gap-2 min-w-[180px] justify-between hover:bg-gray-50 transition-colors"
        >
          <span className={selected.length === 0 ? "text-muted" : ""}>
            {displayText}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-card-border rounded-lg shadow-lg min-w-[240px] max-h-[300px] overflow-y-auto">
          <div className="p-2 border-b border-card-border">
            <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selected.length === accounts.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-accent focus:ring-accent"
              />
              <span className="text-sm font-medium">全選 / 全不選</span>
            </label>
          </div>
          <div className="p-2">
            {accounts.map((account) => (
              <div
                key={account}
                className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-50 rounded"
              >
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(account)}
                    onChange={() => handleToggle(account)}
                    className="rounded border-gray-300 text-accent focus:ring-accent shrink-0"
                  />
                  <span className="text-sm truncate">{account}</span>
                </label>
                {/* 「僅」：一鍵只選這個帳號，免去逐一取消其他帳號 */}
                <button
                  type="button"
                  onClick={() => onChange([account])}
                  className="shrink-0 text-xs text-muted hover:text-accent border border-card-border hover:border-accent rounded px-1.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  僅
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

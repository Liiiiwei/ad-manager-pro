"use client";

import type { Platform } from "@/hooks/use-platform-filter";
import AccountFilter from "@/components/ui/account-filter";

interface HeaderProps {
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  platform: Platform;
  onPlatformChange: (value: Platform) => void;
  // 可選的帳號篩選器
  accounts?: string[];
  selectedAccounts?: string[];
  onAccountsChange?: (accounts: string[]) => void;
}

export default function Header({
  dateRange,
  onDateRangeChange,
  platform,
  onPlatformChange,
  accounts,
  selectedAccounts,
  onAccountsChange,
}: HeaderProps) {
  return (
    <header className="h-14 border-b border-card-border bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {/* 日期範圍選擇 */}
        <select
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value)}
          className="text-sm border border-card-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="last_7d">最近 7 天</option>
          <option value="last_14d">最近 14 天</option>
          <option value="last_30d">最近 30 天</option>
          <option value="last_90d">最近 90 天</option>
        </select>

        {/* 帳號篩選器（如果有提供） */}
        {accounts && selectedAccounts && onAccountsChange && (
          <AccountFilter
            accounts={accounts}
            selected={selectedAccounts}
            onChange={onAccountsChange}
          />
        )}
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {/* 平台切換 */}
        {(["all", "meta", "google"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onPlatformChange(p)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              platform === p
                ? "bg-white shadow-sm font-medium text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {p === "all" ? "全部" : p === "meta" ? "Meta" : "Google"}
          </button>
        ))}
      </div>
    </header>
  );
}

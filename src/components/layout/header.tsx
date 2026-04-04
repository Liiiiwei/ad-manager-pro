"use client";

import type { Platform } from "@/hooks/use-platform-filter";
import AccountFilter from "@/components/ui/account-filter";
import NotificationBell from "@/components/alerts/notification-bell";

interface HeaderProps {
  title?: string;
  dateRange?: string;
  onDateRangeChange?: (value: string) => void;
  platform?: Platform;
  onPlatformChange?: (value: Platform) => void;
  accounts?: string[];
  selectedAccounts?: string[];
  onAccountsChange?: (accounts: string[]) => void;
}

export default function Header({
  title,
  dateRange,
  onDateRangeChange,
  platform,
  onPlatformChange,
  accounts,
  selectedAccounts,
  onAccountsChange,
}: HeaderProps) {
  return (
    <header className="h-14 border-b border-card-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* 頁面標題 */}
        {title && (
          <h1 className="text-sm font-semibold text-foreground hidden sm:block">
            {title}
          </h1>
        )}

        {/* 日期範圍選擇 */}
        {dateRange && onDateRangeChange && (
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value)}
            className="text-sm border border-card-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
          >
            <option value="last_7d">最近 7 天</option>
            <option value="last_14d">最近 14 天</option>
            <option value="last_30d">最近 30 天</option>
            <option value="last_90d">最近 90 天</option>
          </select>
        )}

        {/* 帳號篩選器 */}
        {accounts && selectedAccounts && onAccountsChange && (
          <AccountFilter
            accounts={accounts}
            selected={selectedAccounts}
            onChange={onAccountsChange}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* 通知鈴鐺 */}
        <NotificationBell />

        {/* 平台篩選器 */}
        {dateRange && onDateRangeChange && platform && onPlatformChange && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["all", "meta", "google"] as const).map((p) => (
              <button
                key={p}
                onClick={() => onPlatformChange(p)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all duration-200 ${
                  platform === p
                    ? "bg-white shadow-sm font-medium text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {p === "all" ? "全部" : p === "meta" ? "Meta" : "Google"}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

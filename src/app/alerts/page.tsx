"use client";

import { useState, useMemo } from "react";
import { useAnalysis, useApiKey } from "@/hooks/use-windsor-data";
import { useDateRange } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import AlertList from "@/components/alerts/alert-list";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";

export default function AlertsPage() {
  const { dateRange, setDateRange } = useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { apiKey, ready } = useApiKey();

  if (!ready) {
    return (
      <>
        <Header title="警示中心" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
        <LoadingSpinner />
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <Header title="警示中心" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
        <div className="flex-1 p-6">
          <EmptyState
            title="尚未設定 API Key"
            description="請先在 Settings 頁面輸入你的 Windsor.ai API Key"
            actionLabel="前往設定"
            actionHref="/settings"
          />
        </div>
      </>
    );
  }

  return <AlertsContent dateRange={dateRange} setDateRange={setDateRange} platform={platform} setPlatform={setPlatform} />;
}

function AlertsContent({
  dateRange,
  setDateRange,
  platform,
  setPlatform,
}: {
  dateRange: string;
  setDateRange: (value: string) => void;
  platform: "all" | "meta" | "google";
  setPlatform: (value: "all" | "meta" | "google") => void;
}) {
  const { result, loading, error } = useAnalysis(dateRange);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);

  const alerts = result?.alerts ?? [];

  // 取得所有帳號名稱
  const accountNames = useMemo(() => {
    const names = new Set(alerts.map((a) => a.accountName).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [alerts]);

  // 初始化時選擇所有帳號
  const effectiveFilter = accountFilter.length === 0 && accountNames.length > 0
    ? accountNames
    : accountFilter;

  if (effectiveFilter !== accountFilter && effectiveFilter.length > 0 && accountFilter.length === 0) {
    setAccountFilter(accountNames);
  }

  // 依帳號篩選警示
  const filteredAlerts = useMemo(() => {
    if (effectiveFilter.length === 0 || effectiveFilter.length === accountNames.length) {
      return alerts;
    }
    return alerts.filter((a) => a.accountName && effectiveFilter.includes(a.accountName));
  }, [alerts, effectiveFilter, accountNames.length]);

  if (loading) {
    return (
      <>
        <Header
          title="警示中心"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <LoadingSpinner message="正在分析廣告數據..." />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header
          title="警示中心"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <div className="flex-1 p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-red-800 font-medium">載入失敗</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="警示中心"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        platform={platform}
        onPlatformChange={setPlatform}
        accounts={accountNames}
        selectedAccounts={accountFilter}
        onAccountsChange={setAccountFilter}
      />
      <div className="flex-1 p-4 sm:p-6 animate-fade-in">
        <AlertList alerts={filteredAlerts} />
      </div>
    </>
  );
}

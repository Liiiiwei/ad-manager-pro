"use client";

import { useState, useMemo } from "react";
import {
  useWindsorData,
  useAnalysis,
  useApiKey,
} from "@/hooks/use-windsor-data";
import { useDateRange, resolveDatePreset } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import KpiCard from "@/components/dashboard/kpi-card";
import SpendChart from "@/components/dashboard/spend-chart";
import RoasChart from "@/components/dashboard/roas-chart";
import AlertSummary from "@/components/dashboard/alert-summary";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";
import AccountFilter from "@/components/ui/account-filter";
import { formatCurrency, formatNumber, formatRoas } from "@/lib/utils/format";

const kpiIcons = {
  spend: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  revenue: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  ),
  roas: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  conversions: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export default function DashboardPage() {
  const { dateRange, setDateRange, includeToday, setIncludeToday } =
    useDateRange();
  const { platform, setPlatform } = usePlatformFilter();

  const { hasApiKey, ready } = useApiKey();
  const datePreset = resolveDatePreset(dateRange, includeToday);

  if (!ready) {
    return (
      <>
        <Header
          title="儀表板"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          includeToday={includeToday}
          onIncludeTodayChange={setIncludeToday}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <LoadingSpinner />
      </>
    );
  }

  if (!hasApiKey) {
    return (
      <>
        <Header
          title="儀表板"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          includeToday={includeToday}
          onIncludeTodayChange={setIncludeToday}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <div className="flex-1 p-6">
          <EmptyState
            title="尚未設定 API Key"
            description="請先在設定頁面輸入你的 Windsor.ai API Key 以開始使用"
            actionLabel="前往設定"
            actionHref="/settings"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="儀表板"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        includeToday={includeToday}
        onIncludeTodayChange={setIncludeToday}
        platform={platform}
        onPlatformChange={setPlatform}
      />
      <DashboardContent dateRange={datePreset} platform={platform} />
    </>
  );
}

function DashboardContent({
  dateRange,
  platform,
}: {
  dateRange: string;
  platform: string;
}) {
  const {
    data,
    loading: dataLoading,
    error: dataError,
  } = useWindsorData(dateRange, platform);
  const {
    result,
    loading: analysisLoading,
    error: analysisError,
  } = useAnalysis(dateRange);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);

  const loading = dataLoading || analysisLoading;
  const error = dataError || analysisError;

  const accountNames = useMemo(() => {
    const names = new Set(data.map((d) => d.account_name).filter(Boolean));
    return Array.from(names).sort();
  }, [data]);

  // 未選擇任何帳號時預設顯示全部
  const effectiveFilter = useMemo(() => {
    if (accountFilter.length === 0 && accountNames.length > 0)
      return accountNames;
    return accountFilter;
  }, [accountFilter, accountNames]);

  const filteredData = useMemo(() => {
    if (
      effectiveFilter.length === 0 ||
      effectiveFilter.length === accountNames.length
    ) {
      return data;
    }
    return data.filter((d) => effectiveFilter.includes(d.account_name));
  }, [data, effectiveFilter, accountNames.length]);

  const filteredSummary = useMemo(() => {
    if (
      effectiveFilter.length === 0 ||
      effectiveFilter.length === accountNames.length
    ) {
      return result?.summary;
    }
    const totalSpend = filteredData.reduce((s, d) => s + d.spend, 0);
    const totalRevenue = filteredData.reduce((s, d) => s + d.revenue, 0);
    const totalConversions = filteredData.reduce(
      (s, d) => s + d.conversions,
      0,
    );
    return {
      totalSpend,
      totalRevenue,
      overallRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      totalConversions,
      avgCpc: (() => {
        const totalClicks = filteredData.reduce(
          (s, d) => s + (d.clicks ?? 0),
          0,
        );
        return totalClicks > 0 ? totalSpend / totalClicks : 0;
      })(),
      avgCtr: (() => {
        const totalImpressions = filteredData.reduce(
          (s, d) => s + (d.impressions ?? 0),
          0,
        );
        const totalClicks = filteredData.reduce(
          (s, d) => s + (d.clicks ?? 0),
          0,
        );
        return totalImpressions > 0
          ? (totalClicks / totalImpressions) * 100
          : 0;
      })(),
    };
  }, [
    effectiveFilter.length,
    accountNames.length,
    filteredData,
    result?.summary,
  ]);

  if (loading) {
    return <LoadingSpinner message="正在載入廣告數據..." />;
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 animate-fade-in">
          <p className="text-red-800 font-medium">載入失敗</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* 帳號篩選器 */}
      <AccountFilter
        accounts={accountNames}
        selected={effectiveFilter}
        onChange={setAccountFilter}
      />

      {/* KPI 卡片 - 響應式 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="總花費"
          value={formatCurrency(filteredSummary?.totalSpend ?? 0)}
          icon={kpiIcons.spend}
          iconBg="bg-red-50 text-danger"
        />
        <KpiCard
          title="總營收"
          value={formatCurrency(filteredSummary?.totalRevenue ?? 0)}
          icon={kpiIcons.revenue}
          iconBg="bg-green-50 text-success"
        />
        <KpiCard
          title="ROAS"
          value={formatRoas(filteredSummary?.overallRoas ?? 0)}
          icon={kpiIcons.roas}
          iconBg="bg-blue-50 text-accent"
        />
        <KpiCard
          title="轉換數"
          value={formatNumber(filteredSummary?.totalConversions ?? 0)}
          icon={kpiIcons.conversions}
          iconBg="bg-amber-50 text-warning"
        />
      </div>

      {/* 圖表 - 響應式 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendChart data={filteredData} />
        <RoasChart data={filteredData} />
      </div>

      {/* 警示摘要 */}
      <AlertSummary alerts={result?.alerts ?? []} />
    </div>
  );
}

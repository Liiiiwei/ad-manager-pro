"use client";

import { useState, useMemo, useEffect } from "react";
import { useWindsorData, useAnalysis, getApiKey } from "@/hooks/use-windsor-data";
import { useDateRange } from "@/hooks/use-date-range";
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

export default function DashboardPage() {
  const { dateRange, setDateRange } = useDateRange();
  const { platform, setPlatform } = usePlatformFilter();

  const apiKey = getApiKey();

  if (!apiKey) {
    return (
      <>
        <Header dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
        <div className="flex-1 p-6">
          <EmptyState
            title="尚未設定 API Key"
            description="請先在 Settings 頁面輸入你的 Windsor.ai API Key 以開始使用"
            actionLabel="前往設定"
            actionHref="/settings"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
      <DashboardContent dateRange={dateRange} platform={platform} />
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
  const { data, loading: dataLoading, error: dataError } = useWindsorData(dateRange, platform);
  const { result, loading: analysisLoading, error: analysisError } = useAnalysis(dateRange);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);

  const loading = dataLoading || analysisLoading;
  const error = dataError || analysisError;

  // 取得所有不重複的帳號名稱
  const accountNames = useMemo(() => {
    const names = new Set(data.map((d) => d.account_name).filter(Boolean));
    return Array.from(names).sort();
  }, [data]);

  // 初始化時選擇所有帳號
  useEffect(() => {
    if (accountNames.length > 0 && accountFilter.length === 0) {
      setAccountFilter(accountNames);
    }
  }, [accountNames]);

  // 依帳號篩選資料
  const filteredData = useMemo(() => {
    if (accountFilter.length === 0 || accountFilter.length === accountNames.length) {
      return data;
    }
    return data.filter((d) => accountFilter.includes(d.account_name));
  }, [data, accountFilter, accountNames.length]);

  // 依帳號篩選後重新計算 KPI
  const filteredSummary = useMemo(() => {
    if (accountFilter.length === 0 || accountFilter.length === accountNames.length) {
      return result?.summary;
    }
    const totalSpend = filteredData.reduce((s, d) => s + d.spend, 0);
    const totalRevenue = filteredData.reduce((s, d) => s + d.revenue, 0);
    const totalConversions = filteredData.reduce((s, d) => s + d.conversions, 0);
    return {
      totalSpend,
      totalRevenue,
      overallRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      totalConversions,
      avgCpc: filteredData.length > 0 ? filteredData.reduce((s, d) => s + d.cpc, 0) / filteredData.length : 0,
      avgCtr: filteredData.length > 0 ? filteredData.reduce((s, d) => s + d.ctr, 0) / filteredData.length : 0,
    };
  }, [accountFilter.length, accountNames.length, filteredData, result?.summary]);

  if (loading) {
    return <LoadingSpinner message="正在載入廣告數據..." />;
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-red-800 font-medium">載入失敗</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* 帳號篩選器 */}
      <AccountFilter accounts={accountNames} selected={accountFilter} onChange={setAccountFilter} />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="總花費"
          value={formatCurrency(filteredSummary?.totalSpend ?? 0)}
        />
        <KpiCard
          title="總營收"
          value={formatCurrency(filteredSummary?.totalRevenue ?? 0)}
        />
        <KpiCard
          title="ROAS"
          value={formatRoas(filteredSummary?.overallRoas ?? 0)}
        />
        <KpiCard
          title="轉換數"
          value={formatNumber(filteredSummary?.totalConversions ?? 0)}
        />
      </div>

      {/* 圖表 */}
      <div className="grid grid-cols-2 gap-4">
        <SpendChart data={filteredData} />
        <RoasChart data={filteredData} />
      </div>

      {/* 警示摘要 */}
      <AlertSummary alerts={result?.alerts ?? []} />
    </div>
  );
}

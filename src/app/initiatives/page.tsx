"use client";

import { useState, useMemo } from "react";
import { useWindsorData, useApiKey } from "@/hooks/use-windsor-data";
import { useAccountBudgets } from "@/hooks/use-account-budgets";
import { useDateRange, resolveDatePreset } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import {
  aggregateInitiatives,
  aggregateAccounts,
  countDistinctDates,
} from "@/lib/initiatives/transform";
import Header from "@/components/layout/header";
import InitiativeKpiCards from "@/components/initiatives/initiative-kpi-cards";
import InitiativeTable from "@/components/initiatives/initiative-table";
import AccountPacingCards from "@/components/initiatives/account-pacing-cards";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";

export default function InitiativesPage() {
  const { dateRange, setDateRange, includeToday, setIncludeToday } =
    useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { hasApiKey, ready } = useApiKey();
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const datePreset = resolveDatePreset(dateRange, includeToday);

  const headerProps = {
    title: "行銷活動",
    dateRange,
    onDateRangeChange: setDateRange,
    includeToday,
    onIncludeTodayChange: setIncludeToday,
    platform,
    onPlatformChange: setPlatform,
  };

  if (!ready) {
    return (
      <>
        <Header {...headerProps} />
        <LoadingSpinner />
      </>
    );
  }

  if (!hasApiKey) {
    return (
      <>
        <Header {...headerProps} />
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

  return (
    <InitiativesContent
      dateRange={datePreset}
      platform={platform}
      headerProps={headerProps}
      selectedAccounts={selectedAccounts}
      onAccountsChange={setSelectedAccounts}
    />
  );
}

function InitiativesContent({
  dateRange,
  platform,
  headerProps,
  selectedAccounts,
  onAccountsChange,
}: {
  dateRange: string;
  platform: string;
  headerProps: Record<string, unknown>;
  selectedAccounts: string[];
  onAccountsChange: (accounts: string[]) => void;
}) {
  const { data, loading, error } = useWindsorData(
    dateRange,
    platform,
    "initiative",
  );

  // 帳號手動月預算（budgets 載入前為空物件，畫面與現狀相同，載入後自動重算）
  const { budgets, saveBudget } = useAccountBudgets();

  // 當月天數（使用者本地時區），供手動月預算換算為期間預算
  const daysInMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, []);

  // 期間天數（不重複日期數），供期間預算推算
  const days = useMemo(() => countDistinctDates(data), [data]);

  // 全部行銷活動列（未套帳號篩選），供帳號清單與篩選使用
  const allRows = useMemo(() => aggregateInitiatives(data, days), [data, days]);
  const accounts = useMemo(
    () => [...new Set(allRows.map((r) => r.accountName))].sort(),
    [allRows],
  );
  const rows = useMemo(() => {
    if (selectedAccounts.length === 0) return allRows;
    const set = new Set(selectedAccounts);
    return allRows.filter((r) => set.has(r.accountName));
  }, [allRows, selectedAccounts]);

  // 帳號層級配速摘要（卡片區用全部；KPI 尊重帳號篩選）
  const accountSummaries = useMemo(
    () =>
      aggregateAccounts(data, days, { manualBudgets: budgets, daysInMonth }),
    [data, days, budgets, daysInMonth],
  );
  const filteredSummaries = useMemo(() => {
    if (selectedAccounts.length === 0) return accountSummaries;
    const set = new Set(selectedAccounts);
    return accountSummaries.filter((a) => set.has(a.accountName));
  }, [accountSummaries, selectedAccounts]);

  const header = (
    <Header
      {...headerProps}
      accounts={accounts}
      selectedAccounts={
        selectedAccounts.length === 0 ? accounts : selectedAccounts
      }
      onAccountsChange={onAccountsChange}
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <LoadingSpinner message="正在載入行銷活動..." />
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="flex-1 p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-red-800 font-medium">載入失敗</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      </>
    );
  }

  if (allRows.length === 0) {
    return (
      <>
        {header}
        <div className="flex-1 p-6">
          <EmptyState
            title="沒有行銷活動資料"
            description="這個時間範圍內查無廣告活動，試著調整日期範圍或平台篩選。"
          />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex-1 p-4 sm:p-6 space-y-6 animate-fade-in">
        <InitiativeKpiCards rows={rows} accounts={filteredSummaries} />
        <AccountPacingCards
          accounts={accountSummaries}
          selectedAccounts={selectedAccounts}
          onAccountsChange={onAccountsChange}
          onSaveBudget={saveBudget}
        />
        <InitiativeTable rows={rows} accounts={accountSummaries} />
      </div>
    </>
  );
}

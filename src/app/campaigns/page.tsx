"use client";

import { useWindsorData, useApiKey } from "@/hooks/use-windsor-data";
import { useDateRange } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import CampaignTable from "@/components/campaigns/campaign-table";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";

export default function CampaignsPage() {
  const { dateRange, setDateRange } = useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { apiKey, ready } = useApiKey();

  if (!ready) {
    return (
      <>
        <Header title="廣告活動" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
        <LoadingSpinner />
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <Header title="廣告活動" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
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
    <>
      <Header title="廣告活動" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
      <CampaignsContent dateRange={dateRange} platform={platform} />
    </>
  );
}

function CampaignsContent({
  dateRange,
  platform,
}: {
  dateRange: string;
  platform: string;
}) {
  const { data, loading, error } = useWindsorData(dateRange, platform);

  if (loading) {
    return <LoadingSpinner message="正在載入廣告活動..." />;
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
    <div className="flex-1 p-4 sm:p-6 animate-fade-in">
      <CampaignTable data={data} />
    </div>
  );
}

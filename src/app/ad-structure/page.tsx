"use client";

import { useMemo } from "react";
import {
  useWindsorData,
  useApiKey,
  useAnalysis,
} from "@/hooks/use-windsor-data";
import { useDateRange } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";
import AdStructureFlow from "@/components/ad-structure/ad-structure-flow";
import { buildTree } from "@/lib/ad-structure/transform";

export default function AdStructurePage() {
  const { dateRange, setDateRange } = useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { apiKey, ready } = useApiKey();

  if (!ready) {
    return (
      <>
        <Header
          title="廣告架構"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <LoadingSpinner />
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <Header
          title="廣告架構"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          platform={platform}
          onPlatformChange={setPlatform}
        />
        <div className="flex-1 p-6">
          <EmptyState
            title="尚未設定 API Key"
            description="請先在設定頁面輸入你的 Windsor.ai API Key"
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
        title="廣告架構"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        platform={platform}
        onPlatformChange={setPlatform}
      />
      <AdStructureContent dateRange={dateRange} platform={platform} />
    </>
  );
}

function AdStructureContent({
  dateRange,
  platform,
}: {
  dateRange: string;
  platform: string;
}) {
  const { data, loading, error } = useWindsorData(dateRange, platform);
  const { result: analysis } = useAnalysis(dateRange);

  const trees = useMemo(() => {
    if (!data || data.length === 0) return [];
    return buildTree(data, analysis?.alerts ?? []);
  }, [data, analysis]);

  if (loading) {
    return <LoadingSpinner message="載入廣告架構中..." />;
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

  if (trees.length === 0) {
    return (
      <div className="flex-1 p-6">
        <EmptyState
          title="尚無廣告資料"
          description="目前選擇的日期範圍和平台沒有資料，請調整篩選條件"
        />
      </div>
    );
  }

  return (
    <div
      className="flex-1 relative"
      style={{ minHeight: "calc(100vh - 64px)" }}
    >
      <AdStructureFlow trees={trees} alerts={analysis?.alerts ?? []} />
    </div>
  );
}

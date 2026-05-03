"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useWindsorData,
  useApiKey,
  useAnalysis,
} from "@/hooks/use-windsor-data";
import { useDateRange, resolveDatePreset } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";
import AdStructureFlow from "@/components/ad-structure/ad-structure-flow";
import { buildTree } from "@/lib/ad-structure/transform";

export default function AdStructurePage() {
  const { dateRange, setDateRange, includeToday, setIncludeToday } =
    useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { hasApiKey, ready } = useApiKey();
  const datePreset = resolveDatePreset(dateRange, includeToday);

  if (!ready) {
    return (
      <>
        <Header
          title="廣告架構"
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
          title="廣告架構"
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
        includeToday={includeToday}
        onIncludeTodayChange={setIncludeToday}
        platform={platform}
        onPlatformChange={setPlatform}
      />
      <AdStructureContent dateRange={datePreset} platform={platform} />
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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  const trees = useMemo(() => {
    if (!data || data.length === 0) return [];
    return buildTree(data, analysis?.alerts ?? []);
  }, [data, analysis]);

  // 當 trees 載入或改變時，自動選擇第一個帳號
  useEffect(() => {
    if (trees.length === 0) {
      setSelectedAccountId(null);
      return;
    }
    if (!selectedAccountId || !trees.find((t) => t.id === selectedAccountId)) {
      setSelectedAccountId(trees[0].id);
    }
  }, [trees, selectedAccountId]);

  const selectedTree = useMemo(
    () => trees.find((t) => t.id === selectedAccountId) ?? null,
    [trees, selectedAccountId],
  );

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
      className="flex-1 relative flex flex-col"
      style={{ minHeight: "calc(100vh - 64px)" }}
    >
      {/* 帳號 Tab */}
      {trees.length > 1 && (
        <div className="border-b border-gray-200 bg-white px-4 pt-2 overflow-x-auto">
          <div className="flex gap-1">
            {trees.map((tree) => {
              const isActive = tree.id === selectedAccountId;
              return (
                <button
                  key={tree.id}
                  onClick={() => setSelectedAccountId(tree.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-accent/10 text-accent border-b-2 border-accent"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {tree.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {selectedTree && (
          <AdStructureFlow
            trees={[selectedTree]}
            alerts={analysis?.alerts ?? []}
          />
        )}
      </div>
    </div>
  );
}

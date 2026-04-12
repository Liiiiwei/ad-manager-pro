"use client";

/**
 * 廣告結構心智圖的統一節點元件
 * 支援帳戶、廣告活動、廣告組、廣告四個層級
 */

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { NodeLevel, TreeNodeMetrics } from "@/lib/ad-structure/types";

/** 節點 data 介面 */
export interface AdStructureNodeData {
  label: string;
  level: NodeLevel;
  platform: string;
  metrics: TreeNodeMetrics;
  alertCount: number;
  childCount: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isPausedGroup?: boolean;
  activeChildCount?: number;
  activeAdCount?: number;
  onToggle?: (id: string) => void;
  onSelect?: (id: string) => void;
  [key: string]: unknown;
}

/** 格式化花費金額 */
function formatSpend(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** 層級中文標籤 */
const LEVEL_LABELS: Record<NodeLevel, string> = {
  account: "帳戶",
  campaign: "廣告活動",
  adset: "廣告組",
  ad: "廣告",
};

/** 層級樣式：邊框、背景、陰影 */
const LEVEL_STYLES: Record<NodeLevel, string> = {
  account: "border-blue-300 bg-blue-50/80 shadow-md hover:shadow-lg",
  campaign: "border-indigo-200 bg-indigo-50/60 shadow-sm hover:shadow-md",
  adset: "border-purple-200 bg-purple-50/50 shadow-sm hover:shadow",
  ad: "border-gray-200 bg-white/80 shadow-xs hover:shadow-sm",
};

/** 平台徽章顏色 */
function platformBadge(platform: string) {
  const isMeta =
    platform === "facebook" || platform === "meta" || platform === "instagram";
  const isGoogle = platform === "google" || platform === "google_ads";

  if (isMeta) {
    return {
      label: "Meta",
      className: "bg-blue-100 text-blue-700",
    };
  }
  if (isGoogle) {
    return {
      label: "Google",
      className: "bg-green-100 text-green-700",
    };
  }
  return {
    label: platform,
    className: "bg-gray-100 text-gray-600",
  };
}

/** ROAS 顏色 */
function roasColor(roas: number): string {
  if (roas >= 2) return "text-green-600";
  if (roas >= 1) return "text-yellow-600";
  return "text-red-600";
}

function AdStructureNodeComponent({ id, data }: NodeProps) {
  const {
    label,
    level,
    platform,
    metrics,
    alertCount,
    childCount,
    isExpanded,
    hasChildren,
    isPausedGroup,
    activeChildCount,
    activeAdCount,
    onToggle,
    onSelect,
  } = data as AdStructureNodeData;

  const badge = platformBadge(platform);
  const hasAlerts = alertCount > 0;

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle?.(id);
    },
    [id, onToggle],
  );

  const handleSelect = useCallback(() => {
    onSelect?.(id);
  }, [id, onSelect]);

  return (
    <div
      className={`
        relative rounded-lg border-2 px-3 py-2 transition-all duration-200 cursor-pointer
        ${LEVEL_STYLES[level]}
        ${hasAlerts ? "!border-red-400" : ""}
        ${isPausedGroup ? "!border-dashed !border-gray-400 !bg-gray-50 opacity-90" : ""}
      `}
      onClick={handleSelect}
    >
      {/* Target handle（非帳戶層級才顯示） */}
      {level !== "account" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-slate-400 !border-none"
        />
      )}

      {/* Source handle（有子節點才顯示） */}
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-slate-400 !border-none"
        />
      )}

      {/* 頂部：平台徽章 + 層級標籤 + 警報徽章 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-[10px] text-gray-400">
            {LEVEL_LABELS[level]}
          </span>
        </div>

        {hasAlerts && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {alertCount}
          </span>
        )}
      </div>

      {/* 節點名稱 */}
      <p
        className="text-sm font-semibold text-gray-800 truncate mb-2"
        title={label}
      >
        {label}
      </p>

      {/* 活躍計數（campaign 與 adset 顯示） */}
      {!isPausedGroup && level === "campaign" && (
        <div className="flex items-center gap-2 mb-1.5 text-[10px] text-gray-600">
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
            投放中廣告組 {activeChildCount ?? 0}
          </span>
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
            素材 {activeAdCount ?? 0}
          </span>
        </div>
      )}
      {!isPausedGroup && level === "adset" && (
        <div className="flex items-center gap-2 mb-1.5 text-[10px] text-gray-600">
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
            投放中廣告 {activeChildCount ?? 0}
          </span>
        </div>
      )}

      {/* 指標網格 */}
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <p className="text-[9px] text-gray-400">Spend</p>
          <p className="text-xs font-medium text-gray-700">
            {formatSpend(metrics.spend)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400">ROAS</p>
          <p className={`text-xs font-medium ${roasColor(metrics.roas)}`}>
            {metrics.roas.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400">CTR</p>
          <p className="text-xs font-medium text-gray-700">
            {metrics.ctr.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400">CPC</p>
          <p className="text-xs font-medium text-gray-700">
            ${metrics.cpc.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 展開/收合按鈕 */}
      {hasChildren && (
        <button
          onClick={handleToggle}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors text-[10px] font-medium text-gray-600"
          title={isExpanded ? "收合" : `展開 (${childCount})`}
        >
          {isExpanded ? "−" : `+${childCount}`}
        </button>
      )}
    </div>
  );
}

/** 記憶化元件，避免不必要的重新渲染 */
export const AdStructureNode = memo(AdStructureNodeComponent);
export default AdStructureNode;

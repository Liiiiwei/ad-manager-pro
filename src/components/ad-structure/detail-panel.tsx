"use client";

/**
 * 廣告結構心智圖的詳細資訊面板
 * 從右側滑入，顯示選中節點的完整指標和相關警報
 */

import { useEffect, useRef } from "react";
import type { TreeNode, NodeLevel } from "@/lib/ad-structure/types";
import type { Alert } from "@/lib/analysis/types";

/** 層級中文標籤 */
const LEVEL_LABELS: Record<NodeLevel, string> = {
  account: "帳戶",
  campaign: "廣告活動",
  adset: "廣告組",
  ad: "廣告",
};

/** 警報嚴重度顏色 */
const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

/** 格式化花費金額（TWD） */
function formatCurrency(value: number): string {
  return `NT$ ${value.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** ROAS 顏色徽章 */
function roasBadgeClass(roas: number): string {
  if (roas >= 2) return "bg-green-100 text-green-700";
  if (roas >= 1) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

/** 根據節點層級過濾相關警報 */
function filterAlerts(alerts: Alert[], node: TreeNode): Alert[] {
  return alerts.filter((a) => {
    // 帳戶層級：匹配帳戶名稱
    if (node.level === "account") {
      return a.accountName === node.label;
    }
    // 廣告活動層級
    if (node.level === "campaign") {
      return a.campaignName === node.label;
    }
    // 廣告組層級
    if (node.level === "adset") {
      return a.adsetName === node.label;
    }
    // 廣告層級
    if (node.level === "ad") {
      return a.adName === node.label;
    }
    return false;
  });
}

interface DetailPanelProps {
  node: TreeNode | null;
  alerts: Alert[];
  onClose: () => void;
}

export default function DetailPanel({
  node,
  alerts,
  onClose,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC 鍵關閉面板
  useEffect(() => {
    if (!node) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [node, onClose]);

  // 點擊面板外部關閉
  useEffect(() => {
    if (!node) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [node, onClose]);

  if (!node) return null;

  const relatedAlerts = filterAlerts(alerts, node);
  const topChildren =
    node.children.length > 0
      ? [...node.children]
          .sort((a, b) => b.metrics.spend - a.metrics.spend)
          .slice(0, 5)
      : [];

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 h-full w-[400px] bg-white border-l border-gray-200 z-50 overflow-y-auto animate-slide-in-right shadow-xl"
    >
      {/* 標題區 */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-400">
            {LEVEL_LABELS[node.level]}
          </span>
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {node.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* 效能指標 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">效能指標</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">花費</p>
              <p className="text-base font-semibold text-gray-900">
                {formatCurrency(node.metrics.spend)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">ROAS</p>
              <p
                className={`text-base font-semibold ${node.metrics.roas >= 2 ? "text-green-600" : node.metrics.roas >= 1 ? "text-yellow-600" : "text-red-600"}`}
              >
                {node.metrics.roas.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">CTR</p>
              <p className="text-base font-semibold text-gray-900">
                {node.metrics.ctr.toFixed(2)}%
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">CPC</p>
              <p className="text-base font-semibold text-gray-900">
                NT$ {node.metrics.cpc.toFixed(2)}
              </p>
            </div>
          </div>
        </section>

        {/* 相關警報 */}
        {relatedAlerts.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              相關警報{" "}
              <span className="text-gray-400 font-normal">
                ({relatedAlerts.length})
              </span>
            </h3>
            <div className="space-y-2">
              {relatedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border rounded-lg p-3 ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info}`}
                >
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs mt-1 opacity-80">{alert.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top 5 子節點（花費排行） */}
        {topChildren.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              花費排行 Top 5
            </h3>
            <div className="space-y-2">
              {topChildren.map((child, idx) => (
                <div
                  key={child.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-lg p-3"
                >
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {child.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(child.metrics.spend)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${roasBadgeClass(child.metrics.roas)}`}
                  >
                    {child.metrics.roas.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

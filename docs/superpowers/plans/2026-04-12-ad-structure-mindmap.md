# 廣告架構心智圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增互動式心智圖頁面，以 Account → Campaign → Ad Set → Ad 四層樹狀結構呈現完整廣告架構，支援展開/收合、指標顯示、異常標示、詳情面板。

**Architecture:** 使用 React Flow + dagre 建構水平展開的節點圖。前端將 Windsor API 回傳的扁平 `WindsorAdRecord[]` 轉換為樹狀結構，再透過 dagre 計算節點位置。每個層級有對應的 custom node 元件，單擊開詳情面板，雙擊導航。

**Tech Stack:** React Flow (@xyflow/react), dagre, Next.js 16, React 19, TypeScript, Tailwind CSS 4

---

### Task 1: 安裝依賴

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安裝 React Flow 和 dagre**

```bash
npm install @xyflow/react dagre @types/dagre
```

- [ ] **Step 2: 確認安裝成功**

```bash
npm ls @xyflow/react dagre
```

Expected: 顯示版本號，無 ERR

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: 安裝 React Flow 和 dagre 依賴"
```

---

### Task 2: 型別定義與資料轉換

**Files:**
- Create: `src/lib/ad-structure/types.ts`
- Create: `src/lib/ad-structure/transform.ts`

- [ ] **Step 1: 建立型別定義**

Create `src/lib/ad-structure/types.ts`:

```typescript
export type NodeLevel = "account" | "campaign" | "adset" | "ad";

export interface TreeNodeMetrics {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
}

export interface TreeNode {
  id: string;
  label: string;
  level: NodeLevel;
  platform: string;
  metrics: TreeNodeMetrics;
  alertCount: number;
  childCount: number;
  children: TreeNode[];
}
```

- [ ] **Step 2: 建立轉換函式**

Create `src/lib/ad-structure/transform.ts`:

```typescript
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert } from "@/lib/analysis/types";
import type { TreeNode, TreeNodeMetrics } from "./types";

/** 將扁平的 WindsorAdRecord[] 轉換為樹狀結構 */
export function buildTree(
  records: WindsorAdRecord[],
  alerts: Alert[],
): TreeNode[] {
  // 按 account_name 分組
  const accountMap = new Map<string, WindsorAdRecord[]>();
  for (const r of records) {
    const key = r.account_name || "未命名帳戶";
    const list = accountMap.get(key) ?? [];
    list.push(r);
    accountMap.set(key, list);
  }

  return Array.from(accountMap.entries()).map(([accountName, accountRecords]) => {
    // 按 campaign 分組
    const campaignMap = new Map<string, WindsorAdRecord[]>();
    for (const r of accountRecords) {
      const key = r.campaign || "未命名廣告活動";
      const list = campaignMap.get(key) ?? [];
      list.push(r);
      campaignMap.set(key, list);
    }

    const campaignChildren: TreeNode[] = Array.from(
      campaignMap.entries(),
    ).map(([campaignName, campaignRecords]) => {
      // 按 adset 分組
      const adsetMap = new Map<string, WindsorAdRecord[]>();
      for (const r of campaignRecords) {
        const key = r.adset || "未命名廣告組";
        const list = adsetMap.get(key) ?? [];
        list.push(r);
        adsetMap.set(key, list);
      }

      const adsetChildren: TreeNode[] = Array.from(
        adsetMap.entries(),
      ).map(([adsetName, adsetRecords]) => {
        // Ad 層級：每筆 record 就是一個 ad
        const adChildren: TreeNode[] = adsetRecords.map((r) => {
          const adId = `ad-${accountName}-${campaignName}-${adsetName}-${r.ad_name}`;
          return {
            id: adId,
            label: r.ad_name || "未命名廣告",
            level: "ad" as const,
            platform: r.source,
            metrics: { spend: r.spend, roas: r.roas, ctr: r.ctr, cpc: r.cpc },
            alertCount: countAlerts(alerts, {
              accountName,
              campaignName,
              adsetName,
              adName: r.ad_name,
            }),
            childCount: 0,
            children: [],
          };
        });

        // 合併同名 ad（多天資料聚合）
        const mergedAds = mergeByLabel(adChildren);

        const adsetId = `adset-${accountName}-${campaignName}-${adsetName}`;
        return {
          id: adsetId,
          label: adsetName,
          level: "adset" as const,
          platform: adsetRecords[0].source,
          metrics: aggregateMetrics(mergedAds),
          alertCount: sumAlertCount(mergedAds) + countAlerts(alerts, { accountName, campaignName, adsetName }),
          childCount: mergedAds.length,
          children: mergedAds,
        };
      });

      const campaignId = `campaign-${accountName}-${campaignName}`;
      return {
        id: campaignId,
        label: campaignName,
        level: "campaign" as const,
        platform: campaignRecords[0].source,
        metrics: aggregateMetrics(adsetChildren),
        alertCount: sumAlertCount(adsetChildren) + countAlerts(alerts, { accountName, campaignName }),
        childCount: adsetChildren.length,
        children: adsetChildren,
      };
    });

    const accountId = `account-${accountName}`;
    return {
      id: accountId,
      label: accountName,
      level: "account" as const,
      platform: accountRecords[0].source,
      metrics: aggregateMetrics(campaignChildren),
      alertCount: sumAlertCount(campaignChildren) + countAlerts(alerts, { accountName }),
      childCount: campaignChildren.length,
      children: campaignChildren,
    };
  });
}

/** 合併同 label 的節點（多天資料聚合） */
function mergeByLabel(nodes: TreeNode[]): TreeNode[] {
  const map = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    const list = map.get(n.label) ?? [];
    list.push(n);
    map.set(n.label, list);
  }
  return Array.from(map.values()).map((group) => {
    if (group.length === 1) return group[0];
    const merged = { ...group[0] };
    merged.metrics = {
      spend: group.reduce((s, n) => s + n.metrics.spend, 0),
      roas: weightedAvg(group, "roas"),
      ctr: weightedAvg(group, "ctr"),
      cpc: weightedAvg(group, "cpc"),
    };
    return merged;
  });
}

/** 以 spend 加權平均 */
function weightedAvg(nodes: TreeNode[], field: keyof TreeNodeMetrics): number {
  const totalSpend = nodes.reduce((s, n) => s + n.metrics.spend, 0);
  if (totalSpend === 0) return 0;
  return nodes.reduce((s, n) => s + n.metrics[field] * n.metrics.spend, 0) / totalSpend;
}

/** 聚合子節點指標 */
function aggregateMetrics(children: TreeNode[]): TreeNodeMetrics {
  const totalSpend = children.reduce((s, c) => s + c.metrics.spend, 0);
  return {
    spend: totalSpend,
    roas: totalSpend > 0
      ? children.reduce((s, c) => s + c.metrics.roas * c.metrics.spend, 0) / totalSpend
      : 0,
    ctr: totalSpend > 0
      ? children.reduce((s, c) => s + c.metrics.ctr * c.metrics.spend, 0) / totalSpend
      : 0,
    cpc: totalSpend > 0
      ? children.reduce((s, c) => s + c.metrics.cpc * c.metrics.spend, 0) / totalSpend
      : 0,
  };
}

/** 計算特定層級的 alert 數量 */
function countAlerts(
  alerts: Alert[],
  match: { accountName?: string; campaignName?: string; adsetName?: string; adName?: string },
): number {
  return alerts.filter((a) => {
    if (match.adName) {
      return a.accountName === match.accountName
        && a.campaignName === match.campaignName
        && a.adsetName === match.adsetName
        && a.adName === match.adName;
    }
    if (match.adsetName) {
      return a.accountName === match.accountName
        && a.campaignName === match.campaignName
        && a.adsetName === match.adsetName
        && !a.adName;
    }
    if (match.campaignName) {
      return a.accountName === match.accountName
        && a.campaignName === match.campaignName
        && !a.adsetName;
    }
    return a.accountName === match.accountName && !a.campaignName;
  }).length;
}

/** 加總子節點 alertCount */
function sumAlertCount(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + n.alertCount, 0);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ad-structure/
git commit -m "feat: 新增廣告架構樹狀資料型別與轉換邏輯"
```

---

### Task 3: dagre 排版計算

**Files:**
- Create: `src/lib/ad-structure/layout.ts`

- [ ] **Step 1: 建立排版計算函式**

Create `src/lib/ad-structure/layout.ts`:

```typescript
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { TreeNode, NodeLevel } from "./types";

/** 各層級節點尺寸 */
const NODE_SIZES: Record<NodeLevel, { width: number; height: number }> = {
  account: { width: 280, height: 140 },
  campaign: { width: 260, height: 130 },
  adset: { width: 240, height: 120 },
  ad: { width: 220, height: 110 },
};

/** 將 TreeNode 樹轉換為 React Flow 的 nodes + edges，並用 dagre 計算位置 */
export function computeLayout(
  trees: TreeNode[],
  expandedIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 遞迴收集可見節點
  function collect(node: TreeNode, parentId?: string) {
    const size = NODE_SIZES[node.level];
    nodes.push({
      id: node.id,
      type: `${node.level}Node`,
      position: { x: 0, y: 0 }, // dagre 會覆蓋
      data: {
        label: node.label,
        level: node.level,
        platform: node.platform,
        metrics: node.metrics,
        alertCount: node.alertCount,
        childCount: node.childCount,
        isExpanded: expandedIds.has(node.id),
        hasChildren: node.children.length > 0,
      },
      style: { width: size.width, height: size.height },
    });

    if (parentId) {
      edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        animated: false,
      });
    }

    // 只收集展開的子節點
    if (expandedIds.has(node.id)) {
      for (const child of node.children) {
        collect(child, node.id);
      }
    }
  }

  for (const tree of trees) {
    collect(tree);
  }

  // 使用 dagre 計算水平佈局
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, edgesep: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const size = NODE_SIZES[node.data.level as NodeLevel];
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  // 將 dagre 計算的位置寫回 React Flow nodes
  for (const node of nodes) {
    const pos = g.node(node.id);
    const size = NODE_SIZES[node.data.level as NodeLevel];
    node.position = {
      x: pos.x - size.width / 2,
      y: pos.y - size.height / 2,
    };
  }

  return { nodes, edges };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ad-structure/layout.ts
git commit -m "feat: 新增 dagre 自動排版計算"
```

---

### Task 4: Custom Node 元件

**Files:**
- Create: `src/components/ad-structure/nodes/ad-structure-node.tsx`

所有層級共用一個 node 元件，透過 `level` prop 區分樣式。

- [ ] **Step 1: 建立統一的自訂節點元件**

Create `src/components/ad-structure/nodes/ad-structure-node.tsx`:

```typescript
"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

interface AdStructureNodeData {
  label: string;
  level: "account" | "campaign" | "adset" | "ad";
  platform: string;
  metrics: { spend: number; roas: number; ctr: number; cpc: number };
  alertCount: number;
  childCount: number;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle?: (id: string) => void;
  onSelect?: (id: string) => void;
}

/** 平台圖示 */
function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "facebook" || platform === "instagram") {
    return <span className="text-xs font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Meta</span>;
  }
  if (platform === "google_ads" || platform === "google") {
    return <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Google</span>;
  }
  return <span className="text-xs font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{platform}</span>;
}

/** 格式化數字 */
function fmt(value: number, type: "currency" | "percent" | "multiplier" | "decimal"): string {
  if (type === "currency") {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "multiplier") return `${value.toFixed(2)}x`;
  return value.toFixed(2);
}

/** 各層級樣式 */
const levelStyles = {
  account: "border-slate-300 bg-slate-50 shadow-md",
  campaign: "border-slate-200 bg-white shadow-sm",
  adset: "border-slate-100 bg-white/80 shadow-sm",
  ad: "border-slate-100 bg-white/60 shadow-xs",
};

const levelLabels = {
  account: "帳戶",
  campaign: "廣告活動",
  adset: "廣告組",
  ad: "廣告",
};

function AdStructureNode({ id, data }: NodeProps) {
  const d = data as unknown as AdStructureNodeData;
  const hasAlert = d.alertCount > 0;

  return (
    <div
      className={`rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 hover:shadow-md ${levelStyles[d.level]} ${hasAlert ? "!border-red-400" : ""}`}
      onClick={() => d.onSelect?.(id)}
      onDoubleClick={() => {
        if (d.level === "campaign") {
          window.location.href = "/campaigns";
        }
      }}
    >
      {/* 左側 handle（非 account） */}
      {d.level !== "account" && (
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-300 !border-slate-400" />
      )}

      {/* 標題列 */}
      <div className="flex items-center gap-2 mb-2">
        <PlatformIcon platform={d.platform} />
        <span className="text-xs text-slate-400">{levelLabels[d.level]}</span>
        <span className="flex-1 text-sm font-semibold text-slate-800 truncate" title={d.label}>
          {d.label}
        </span>
        {hasAlert && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {d.alertCount}
          </span>
        )}
      </div>

      {/* 指標 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Spend</span>
          <span className="font-medium text-slate-700">{fmt(d.metrics.spend, "currency")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">ROAS</span>
          <span className={`font-medium ${d.metrics.roas >= 2 ? "text-green-600" : d.metrics.roas >= 1 ? "text-yellow-600" : "text-red-600"}`}>
            {fmt(d.metrics.roas, "multiplier")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">CTR</span>
          <span className="font-medium text-slate-700">{fmt(d.metrics.ctr, "percent")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">CPC</span>
          <span className="font-medium text-slate-700">{fmt(d.metrics.cpc, "currency")}</span>
        </div>
      </div>

      {/* 展開/收合 */}
      {d.hasChildren && (
        <button
          className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-accent transition-colors w-full"
          onClick={(e) => {
            e.stopPropagation();
            d.onToggle?.(id);
          }}
        >
          <svg
            className={`w-3 h-3 transition-transform ${d.isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {d.isExpanded ? "收合" : `${d.childCount} ${levelLabels[d.level === "account" ? "campaign" : d.level === "campaign" ? "adset" : "ad"]}`}
        </button>
      )}

      {/* 右側 handle（有子節點） */}
      {d.hasChildren && (
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-300 !border-slate-400" />
      )}
    </div>
  );
}

export default memo(AdStructureNode);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ad-structure/nodes/
git commit -m "feat: 新增廣告架構自訂節點元件"
```

---

### Task 5: 詳情面板

**Files:**
- Create: `src/components/ad-structure/detail-panel.tsx`

- [ ] **Step 1: 建立詳情面板元件**

Create `src/components/ad-structure/detail-panel.tsx`:

```typescript
"use client";

import { useEffect, useRef } from "react";
import type { TreeNode } from "@/lib/ad-structure/types";
import type { Alert } from "@/lib/analysis/types";

interface DetailPanelProps {
  node: TreeNode | null;
  alerts: Alert[];
  onClose: () => void;
}

/** 從 alerts 篩選出與此節點相關的 alerts */
function getNodeAlerts(node: TreeNode, alerts: Alert[]): Alert[] {
  return alerts.filter((a) => {
    const label = node.label;
    switch (node.level) {
      case "account":
        return a.accountName === label;
      case "campaign":
        return a.campaignName === label;
      case "adset":
        return a.adsetName === label;
      case "ad":
        return a.adName === label;
      default:
        return false;
    }
  });
}

/** 格式化數字 */
function fmtNum(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DetailPanel({ node, alerts, onClose }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC 關閉
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 點擊外部關閉
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (!node) return null;

  const nodeAlerts = getNodeAlerts(node, alerts);
  const topChildren = node.children
    .slice()
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
    .slice(0, 5);

  const levelLabel = {
    account: "帳戶",
    campaign: "廣告活動",
    adset: "廣告組",
    ad: "廣告",
  }[node.level];

  const childLevelLabel = {
    account: "廣告活動",
    campaign: "廣告組",
    adset: "廣告",
    ad: "",
  }[node.level];

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 h-full w-[400px] bg-white border-l border-slate-200 shadow-2xl z-50 overflow-y-auto animate-slide-in-right"
    >
      {/* 標題 */}
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">{levelLabel}</p>
          <h2 className="text-lg font-bold text-slate-800 truncate">{node.label}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* 指標表格 */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">績效指標</h3>
          <div className="space-y-2">
            {[
              { label: "花費", value: fmtNum(node.metrics.spend) },
              { label: "ROAS", value: `${node.metrics.roas.toFixed(2)}x` },
              { label: "CTR", value: `${node.metrics.ctr.toFixed(2)}%` },
              { label: "CPC", value: fmtNum(node.metrics.cpc) },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-medium text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Alerts */}
        {nodeAlerts.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              警示 ({nodeAlerts.length})
            </h3>
            <div className="space-y-2">
              {nodeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border text-sm ${
                    alert.severity === "critical"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : alert.severity === "warning"
                        ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                        : "bg-blue-50 border-blue-200 text-blue-800"
                  }`}
                >
                  <p className="font-medium">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-80">{alert.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top 子節點排行 */}
        {topChildren.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Top {childLevelLabel}（依花費）
            </h3>
            <div className="space-y-2">
              {topChildren.map((child, i) => (
                <div key={child.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-medium">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-slate-700">{child.label}</span>
                  <span className="font-medium text-slate-800">{fmtNum(child.metrics.spend)}</span>
                  <span className={`text-xs ${child.metrics.roas >= 2 ? "text-green-600" : child.metrics.roas >= 1 ? "text-yellow-600" : "text-red-600"}`}>
                    {child.metrics.roas.toFixed(1)}x
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
```

- [ ] **Step 2: 新增 slide-in 動畫到 globals.css**

在 `src/app/globals.css` 新增：

```css
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ad-structure/detail-panel.tsx src/app/globals.css
git commit -m "feat: 新增廣告架構詳情面板"
```

---

### Task 6: React Flow 主畫布元件

**Files:**
- Create: `src/components/ad-structure/ad-structure-flow.tsx`

- [ ] **Step 1: 建立主畫布元件**

Create `src/components/ad-structure/ad-structure-flow.tsx`:

```typescript
"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TreeNode } from "@/lib/ad-structure/types";
import type { Alert } from "@/lib/analysis/types";
import { computeLayout } from "@/lib/ad-structure/layout";
import AdStructureNode from "./nodes/ad-structure-node";
import DetailPanel from "./detail-panel";

interface AdStructureFlowProps {
  trees: TreeNode[];
  alerts: Alert[];
}

/** 從樹中找到特定 id 的節點 */
function findNode(trees: TreeNode[], id: string): TreeNode | null {
  for (const tree of trees) {
    if (tree.id === id) return tree;
    const found = findNode(tree.children, id);
    if (found) return found;
  }
  return null;
}

/** 收集預設展開的 id（前兩層，若只有一個 account 則前三層） */
function getDefaultExpanded(trees: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  for (const account of trees) {
    ids.add(account.id);
    // 如果只有一個 account，多展開一層
    const expandCampaigns = trees.length === 1;
    for (const campaign of account.children) {
      if (expandCampaigns) {
        ids.add(campaign.id);
      }
    }
  }
  return ids;
}

const nodeTypes = {
  accountNode: AdStructureNode,
  campaignNode: AdStructureNode,
  adsetNode: AdStructureNode,
  adNode: AdStructureNode,
};

export default function AdStructureFlow({ trees, alerts }: AdStructureFlowProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => getDefaultExpanded(trees));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  // 計算佈局
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(trees, expandedIds),
    [trees, expandedIds],
  );

  // 注入 callback 到 node data
  const nodesWithCallbacks = useMemo(
    () =>
      layoutNodes.map((n) => ({
        ...n,
        data: { ...n.data, onToggle: toggleNode, onSelect: selectNode },
      })),
    [layoutNodes, toggleNode, selectNode],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithCallbacks);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // 當 layout 變化時更新 nodes/edges
  useMemo(() => {
    setNodes(nodesWithCallbacks);
    setEdges(layoutEdges);
  }, [nodesWithCallbacks, layoutEdges, setNodes, setEdges]);

  const selectedTreeNode = selectedNodeId ? findNode(trees, selectedNodeId) : null;

  // 全部展開/收合
  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    function collect(node: TreeNode) {
      if (node.children.length > 0) {
        ids.add(node.id);
        node.children.forEach(collect);
      }
    }
    trees.forEach(collect);
    setExpandedIds(ids);
  }, [trees]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* 工具列 */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={expandAll}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
        >
          全部展開
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
        >
          全部收合
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-right" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>

      {/* 詳情面板 */}
      <DetailPanel
        node={selectedTreeNode}
        alerts={alerts}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ad-structure/ad-structure-flow.tsx
git commit -m "feat: 新增 React Flow 主畫布元件"
```

---

### Task 7: 頁面與路由

**Files:**
- Create: `src/app/ad-structure/page.tsx`

- [ ] **Step 1: 建立頁面**

Create `src/app/ad-structure/page.tsx`:

```typescript
"use client";

import { useWindsorData, useApiKey, useAnalysis } from "@/hooks/use-windsor-data";
import { useDateRange } from "@/hooks/use-date-range";
import { usePlatformFilter } from "@/hooks/use-platform-filter";
import Header from "@/components/layout/header";
import EmptyState from "@/components/ui/empty-state";
import LoadingSpinner from "@/components/ui/loading-spinner";
import AdStructureFlow from "@/components/ad-structure/ad-structure-flow";
import { buildTree } from "@/lib/ad-structure/transform";
import { useMemo } from "react";

export default function AdStructurePage() {
  const { dateRange, setDateRange } = useDateRange();
  const { platform, setPlatform } = usePlatformFilter();
  const { apiKey, ready } = useApiKey();

  if (!ready) {
    return (
      <>
        <Header title="廣告架構" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
        <LoadingSpinner />
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <Header title="廣告架構" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
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
      <Header title="廣告架構" dateRange={dateRange} onDateRangeChange={setDateRange} platform={platform} onPlatformChange={setPlatform} />
      <AdStructureContent dateRange={dateRange} platform={platform} />
    </>
  );
}

function AdStructureContent({ dateRange, platform }: { dateRange: string; platform: string }) {
  const { data, loading, error } = useWindsorData(dateRange, platform);
  const { result: analysis, loading: analysisLoading } = useAnalysis(dateRange);

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
    <div className="flex-1 relative" style={{ minHeight: "calc(100vh - 64px)" }}>
      <AdStructureFlow trees={trees} alerts={analysis?.alerts ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ad-structure/
git commit -m "feat: 新增廣告架構頁面路由"
```

---

### Task 8: 側邊欄新增入口

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: 新增「廣告架構」到導航**

在 `sidebar.tsx` 的 `navItems` 陣列中，在 `campaigns` 項目後面新增：

```typescript
const navItems = [
  { href: "/dashboard", label: "儀表板", icon: "chart" },
  { href: "/campaigns", label: "廣告活動", icon: "megaphone" },
  { href: "/ad-structure", label: "廣告架構", icon: "tree" },
  { href: "/alerts", label: "警示中心", icon: "bell" },
  { href: "/alerts/rules", label: "提醒規則", icon: "bellGear" },
  { href: "/settings", label: "設定", icon: "gear" },
];
```

- [ ] **Step 2: 新增 tree 圖示到 icons 物件**

```typescript
tree: (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 6v14m0-14l4 4m12-4v14m0-14l-4 4M4 20h16M8 10v6m8-6v6" />
  </svg>
),
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: 側邊欄新增廣告架構入口"
```

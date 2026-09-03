/**
 * 使用 dagre 計算廣告結構心智圖的節點佈局
 * 只顯示展開節點的子節點，支援左到右的層級排列
 */

import dagre from "dagre";
import { Position } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import type { TreeNode, NodeLevel } from "./types";

/** 各層級的節點尺寸 */
const NODE_SIZES: Record<NodeLevel, { width: number; height: number }> = {
  account: { width: 280, height: 140 },
  campaign: { width: 260, height: 130 },
  adset: { width: 240, height: 120 },
  ad: { width: 220, height: 110 },
};

/** 遞迴收集可見節點和邊 */
function collectVisible(
  tree: TreeNode,
  expandedIds: Set<string>,
  parentId: string | null,
  nodes: Node[],
  edges: Edge[],
): void {
  const size = NODE_SIZES[tree.level];
  const isExpanded = expandedIds.has(tree.id);
  const hasChildren = tree.children.length > 0;

  nodes.push({
    id: tree.id,
    type: `${tree.level}Node`,
    position: { x: 0, y: 0 }, // dagre 稍後會覆寫
    data: {
      label: tree.label,
      level: tree.level,
      platform: tree.platform,
      metrics: tree.metrics,
      alertCount: tree.alertCount,
      childCount: tree.childCount,
      isExpanded,
      hasChildren,
      isPausedGroup: tree.isPausedGroup ?? false,
      activeChildCount: tree.activeChildCount,
      activeAdCount: tree.activeAdCount,
      accountId: tree.accountId,
      campaignId: tree.campaignId,
      adsetId: tree.adsetId,
      adId: tree.adId,
    },
    width: size.width,
    height: size.height,
    // 帳戶節點無 target handle；葉節點無 source handle
    ...(tree.level === "account" ? {} : { targetPosition: Position.Left }),
    ...(hasChildren ? { sourcePosition: Position.Right } : {}),
  });

  // 建立與父節點的邊
  if (parentId) {
    edges.push({
      id: `${parentId}->${tree.id}`,
      source: parentId,
      target: tree.id,
      type: "smoothstep",
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    });
  }

  // 只有展開的節點才顯示子節點
  if (isExpanded && hasChildren) {
    for (const child of tree.children) {
      collectVisible(child, expandedIds, tree.id, nodes, edges);
    }
  }
}

/**
 * 計算心智圖佈局
 * @param trees - 根節點陣列
 * @param expandedIds - 已展開的節點 ID 集合
 * @returns React Flow 所需的節點和邊
 */
export function computeLayout(
  trees: TreeNode[],
  expandedIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 收集所有可見節點
  for (const tree of trees) {
    collectVisible(tree, expandedIds, null, nodes, edges);
  }

  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // 建立 dagre 圖形
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 40,
    ranksep: 80,
  });

  // 加入節點
  for (const node of nodes) {
    const level = node.data.level as NodeLevel;
    const size = NODE_SIZES[level];
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  // 加入邊
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // 執行佈局
  dagre.layout(g);

  // 將 dagre 計算的位置套用到 React Flow 節點（置中調整）
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    const level = node.data.level as NodeLevel;
    const size = NODE_SIZES[level];

    // dagre 回傳的是中心點，需要減去一半寬高得到左上角
    node.position = {
      x: dagreNode.x - size.width / 2,
      y: dagreNode.y - size.height / 2,
    };
  }

  return { nodes, edges };
}

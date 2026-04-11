"use client";

/**
 * 廣告結構心智圖主畫布
 * 使用 React Flow + dagre 佈局，支援展開/收合節點和詳細面板
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { TreeNode } from "@/lib/ad-structure/types";
import type { Alert } from "@/lib/analysis/types";
import { computeLayout } from "@/lib/ad-structure/layout";
import { AdStructureNode } from "./nodes/ad-structure-node";
import DetailPanel from "./detail-panel";

/** 節點類型映射 */
const nodeTypes = {
  accountNode: AdStructureNode,
  campaignNode: AdStructureNode,
  adsetNode: AdStructureNode,
  adNode: AdStructureNode,
};

/** 收集樹中所有節點 ID */
function collectAllIds(trees: TreeNode[]): string[] {
  const ids: string[] = [];
  function walk(node: TreeNode) {
    ids.push(node.id);
    for (const child of node.children) walk(child);
  }
  for (const tree of trees) walk(tree);
  return ids;
}

/** 在樹中查找指定 ID 的節點 */
function findNodeById(trees: TreeNode[], id: string): TreeNode | null {
  for (const tree of trees) {
    if (tree.id === id) return tree;
    const found = findNodeById(tree.children, id);
    if (found) return found;
  }
  return null;
}

/** 計算預設展開的節點 ID */
function getDefaultExpanded(trees: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  // 展開所有帳戶
  for (const tree of trees) {
    ids.add(tree.id);
  }
  // 如果只有一個帳戶，也展開其下所有廣告活動
  if (trees.length === 1) {
    for (const campaign of trees[0].children) {
      ids.add(campaign.id);
    }
  }
  return ids;
}

interface AdStructureFlowProps {
  trees: TreeNode[];
  alerts: Alert[];
}

export default function AdStructureFlow({
  trees,
  alerts,
}: AdStructureFlowProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    getDefaultExpanded(trees),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // 展開/收合節點
  const handleToggle = useCallback((id: string) => {
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

  // 選取節點
  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  // 關閉詳細面板
  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // 全部展開
  const handleExpandAll = useCallback(() => {
    const allIds = collectAllIds(trees);
    setExpandedIds(new Set(allIds));
  }, [trees]);

  // 全部收合
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // 根據展開狀態計算佈局並注入回呼
  useEffect(() => {
    const layout = computeLayout(trees, expandedIds);

    // 注入 onToggle 和 onSelect 回呼到節點 data
    const nodesWithCallbacks = layout.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onToggle: handleToggle,
        onSelect: handleSelect,
      },
    }));

    setNodes(nodesWithCallbacks);
    setEdges(layout.edges);
  }, [trees, expandedIds, handleToggle, handleSelect, setNodes, setEdges]);

  // 查找選中的 TreeNode
  const selectedTreeNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNodeById(trees, selectedNodeId);
  }, [trees, selectedNodeId]);

  return (
    <div className="w-full h-full relative">
      {/* 工具列 */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={handleExpandAll}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-gray-700"
        >
          全部展開
        </button>
        <button
          onClick={handleCollapseAll}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-gray-700"
        >
          全部收合
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Controls position="bottom-right" />
        <Background variant={BackgroundVariant.Dots} gap={20} color="#e2e8f0" />
      </ReactFlow>

      {/* 詳細資訊面板 */}
      <DetailPanel
        node={selectedTreeNode}
        alerts={alerts}
        onClose={handleCloseDetail}
      />
    </div>
  );
}

/** 廣告結構心智圖的型別定義 */

export type NodeLevel = "account" | "campaign" | "adset" | "ad";

/** 節點指標 */
export interface TreeNodeMetrics {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
}

/** 樹狀結構節點 */
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

/** 廣告結構心智圖的型別定義 */

export type NodeLevel = "account" | "campaign" | "adset" | "ad";

/** 節點指標 */
export interface TreeNodeMetrics {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
}

/** 投放狀態 */
export type NodeStatus = "ACTIVE" | "PAUSED" | "UNKNOWN";

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
  /** 投放狀態（ACTIVE 有投放；PAUSED 暫停；UNKNOWN 無資料） */
  status: NodeStatus;
  /** 是否為「已暫停」聚合卡（彙整多個暫停的同層子節點） */
  isPausedGroup?: boolean;
  /** 正在投放的直接子節點數（campaign/adset 用） */
  activeChildCount?: number;
  /** 正在投放的不重複廣告素材名稱數（campaign 用，跨 adset 以 ad_name 去重） */
  activeAdCount?: number;
}

/** 行銷活動（以帳號＋前綴合併）層級的型別 */

/** 展開後的單一 campaign 明細 */
export interface InitiativeCampaign {
  campaign: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
  lifetimeBudget: number;
  dailyBudget: number;
  /** 投放狀態（取期間內最新日期那筆；ACTIVE / PAUSED / 其他 / 空字串未知）*/
  status: string;
}

/** 一個行銷活動（同帳號、campaign 名稱第一個 _ 前綴相同者合併）*/
export interface InitiativeRow {
  /** 帳號名稱（活動綁帳號，避免跨客戶誤併）*/
  accountName: string;
  /** 前綴（活動名）*/
  prefix: string;
  /** 唯一鍵 `${accountName}:::${prefix}` */
  key: string;
  /** 平台顯示名（Meta / Google / 其他）*/
  platform: string;

  // 可加總指標
  spend: number;
  revenue: number;
  conversions: number;

  // 衍生指標
  roas: number; // 加權 Σ營收/Σ花費
  cpa: number; // Σ花費/Σ轉換，轉換為 0 時為 0

  // 預算（快照值，跨 campaign 加總、勿跨日加總）
  lifetimeBudget: number; // Σ 各 campaign 的 lifetime 快照
  dailyBudget: number; // Σ 各 campaign 的 daily 快照
  budget: number; // 有效總預算（P1 = lifetimeBudget）
  hasBudget: boolean; // 是否有可算總進度的預算（lifetime > 0）
  progress: number; // 花費/預算，無預算為 0

  // 配速推算
  /** 配速推算期間預算：Σ(ACTIVE 活動日預算) × 天數；lifetime 活動走消耗語意不計入 */
  periodBudget: number;
  /** 配速達成率 = 花費 ÷ periodBudget；有 lifetime 預算或無期間預算時為 0 */
  pacingProgress: number;

  // 展開明細
  campaigns: InitiativeCampaign[];
}

/** 帳號層級的預算配速摘要 */
export interface AccountSummary {
  accountName: string;
  /** 平台顯示名（Meta / Google / 其他）*/
  platform: string;
  /** 全部活動花費（含已暫停）*/
  spend: number;
  /** 期間預算：Σ(ACTIVE 活動日預算) × 天數；lifetime 活動改以 lifetime 金額計入（不乘天數）*/
  periodBudget: number;
  /** periodBudget > 0 */
  hasBudget: boolean;
  /** 花費 ÷ 期間預算；無期間預算為 0 */
  progress: number;
}

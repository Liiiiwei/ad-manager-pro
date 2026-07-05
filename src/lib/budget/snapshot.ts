import type { WindsorAdRecord } from "@/lib/windsor/types";

/** 一個 campaign 的一種預算類型快照值 */
export interface CampaignBudget {
  /** 「平台+帳戶名+campaign 名」複合鍵（無穩定 ID，改名視為新 campaign — 已知限制）*/
  entityKey: string;
  entityLabel: string;
  platform: string;
  accountName: string;
  budgetType: "daily" | "lifetime";
  budgetValue: number;
}

/** DB 讀出的既有快照（比對只需這三欄）*/
export interface SnapshotRecord {
  entityKey: string;
  budgetType: string;
  budgetValue: number;
}

/** 偵測到的一筆平台端預算變更 */
export interface DetectedChange {
  entityKey: string;
  entityLabel: string;
  platform: string;
  accountName: string;
  budgetType: string;
  previousValue: number;
  newValue: number;
  changePercent: number | null;
}

/** 平台名正規化（避免耦合 transform 內部 helper，4 行重複可接受）*/
function platformOf(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("google")) return "google";
  if (s.includes("face") || s.includes("insta") || s.includes("meta"))
    return "meta";
  return source;
}

/** 單元分隔字元（Unit Separator），不會出現在真實平台/帳戶/campaign 名稱中 */
const SEP = "";

/** 組合 entityKey：平台 + 帳戶名 + campaign 名，避免跨帳戶/跨平台同名 campaign 被誤合併 */
function makeEntityKey(
  platform: string,
  accountName: string,
  campaignName: string,
): string {
  return [platform, accountName, campaignName].join(SEP);
}

/** 從 Windsor 記錄抽取各 campaign 的當前預算（跨日取最大，比照 transform 快照邏輯）*/
export function extractCampaignBudgets(
  records: WindsorAdRecord[],
): CampaignBudget[] {
  const map = new Map<
    string,
    {
      label: string;
      platform: string;
      accountName: string;
      daily: number;
      lifetime: number;
    }
  >();
  for (const r of records) {
    const platform = platformOf(r.source);
    const accountName = r.account_name?.trim() || "未命名帳戶";
    const campaignName = r.campaign?.trim() || "未命名";
    const key = makeEntityKey(platform, accountName, campaignName);
    let acc = map.get(key);
    if (!acc) {
      acc = {
        label: `${campaignName}（${accountName}）`,
        platform,
        accountName,
        daily: 0,
        lifetime: 0,
      };
      map.set(key, acc);
    }
    acc.daily = Math.max(acc.daily, r.campaignDailyBudget || 0);
    acc.lifetime = Math.max(acc.lifetime, r.campaignLifetimeBudget || 0);
  }

  const out: CampaignBudget[] = [];
  for (const [key, v] of map) {
    if (v.daily > 0) {
      out.push({
        entityKey: key,
        entityLabel: v.label,
        platform: v.platform,
        accountName: v.accountName,
        budgetType: "daily",
        budgetValue: v.daily,
      });
    }
    if (v.lifetime > 0) {
      out.push({
        entityKey: key,
        entityLabel: v.label,
        platform: v.platform,
        accountName: v.accountName,
        budgetType: "lifetime",
        budgetValue: v.lifetime,
      });
    }
  }
  return out;
}

/** 比對既有快照與當前值，回傳有變化的條目（首見不算變更）*/
export function diffCampaignBudgets(
  previous: SnapshotRecord[],
  current: CampaignBudget[],
): DetectedChange[] {
  const prevMap = new Map(
    previous.map((p) => [`${p.entityKey}${SEP}${p.budgetType}`, p.budgetValue]),
  );
  const changes: DetectedChange[] = [];
  for (const c of current) {
    const key = `${c.entityKey}${SEP}${c.budgetType}`;
    if (!prevMap.has(key)) continue; // 首見 → baseline，不算變更
    const prev = prevMap.get(key)!;
    if (prev === c.budgetValue) continue;
    changes.push({
      entityKey: c.entityKey,
      entityLabel: c.entityLabel,
      platform: c.platform,
      accountName: c.accountName,
      budgetType: c.budgetType,
      previousValue: prev,
      newValue: c.budgetValue,
      changePercent: prev !== 0 ? ((c.budgetValue - prev) / prev) * 100 : null,
    });
  }
  return changes;
}

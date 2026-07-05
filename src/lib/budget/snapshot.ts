import type { WindsorAdRecord } from "@/lib/windsor/types";
import { prisma } from "@/lib/db/prisma";

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

/**
 * 同步 campaign 快照：偵測平台端預算變更 → 寫 changelog + 自動對帳關閉待辦 → upsert 快照。
 * 回傳偵測到的變更筆數。
 */
export async function syncCampaignSnapshots(
  userId: string,
  current: CampaignBudget[],
): Promise<number> {
  const previous = await prisma.budgetSnapshot.findMany({
    where: { userId, scope: "campaign" },
    select: { entityKey: true, budgetType: true, budgetValue: true },
  });
  const changes = diffCampaignBudgets(previous, current);

  for (const ch of changes) {
    const log = await prisma.budgetChangeLog.create({
      data: {
        userId,
        source: "platform_detected",
        scope: "campaign",
        platform: ch.platform,
        entityKey: ch.entityKey,
        entityLabel: ch.entityLabel,
        budgetType: ch.budgetType,
        previousValue: ch.previousValue,
        newValue: ch.newValue,
        changePercent: ch.changePercent,
      },
    });
    // 自動對帳：系統偵測到平台端已調整此帳號預算，視為對應待辦已處理
    await prisma.budgetActionItem.updateMany({
      where: {
        userId,
        accountName: ch.accountName,
        reason: "pacing_overspend",
        status: "open",
      },
      data: {
        status: "resolved",
        resolvedBy: "auto_detected_change",
        linkedChangeLogId: log.id,
        resolvedAt: new Date(),
      },
    });
  }

  // upsert 所有當前值（含首見 baseline）為最新快照
  for (const c of current) {
    await prisma.budgetSnapshot.upsert({
      where: {
        userId_scope_entityKey_budgetType: {
          userId,
          scope: "campaign",
          entityKey: c.entityKey,
          budgetType: c.budgetType,
        },
      },
      create: {
        userId,
        scope: "campaign",
        platform: c.platform,
        entityKey: c.entityKey,
        entityLabel: c.entityLabel,
        budgetType: c.budgetType,
        budgetValue: c.budgetValue,
      },
      update: {
        budgetValue: c.budgetValue,
        entityLabel: c.entityLabel,
        platform: c.platform,
        capturedAt: new Date(),
      },
    });
  }

  return changes.length;
}

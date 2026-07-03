import type { WindsorAdRecord } from "@/lib/windsor/types";
import type {
  InitiativeRow,
  InitiativeCampaign,
  AccountSummary,
} from "./types";

/** 由 campaign 名稱與帳號推導活動鍵（帳號＋第一個 _ 之前的前綴）*/
export function initiativeKey(
  campaign: string,
  accountName: string,
): { accountName: string; prefix: string; key: string } {
  const acc = accountName?.trim() || "未命名帳戶";
  const name = campaign?.trim() || "未命名";
  const idx = name.indexOf("_");
  // idx === -1（無底線）或 idx === 0（以底線開頭）→ 整串當前綴
  const prefix = idx > 0 ? name.slice(0, idx) : name;
  return { accountName: acc, prefix, key: `${acc}:::${prefix}` };
}

/** 由 source 推導平台顯示名 */
function platformLabel(source: string): string {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) {
    return "Meta";
  }
  if (s.includes("google")) return "Google";
  return source || "其他";
}

/** campaign 內部的可變累加狀態 */
interface CampaignAcc {
  campaign: string;
  spend: number;
  revenue: number;
  conversions: number;
  /** 預算為快照：取跨日的最大值（同值重複，用 max 穩健處理 0 補值）*/
  lifetimeBudget: number;
  dailyBudget: number;
  /** 投放狀態：取最新日期那筆（statusDate 記錄該筆日期）*/
  status: string;
  statusDate: string;
}

/** 活動內部的可變累加狀態 */
interface InitiativeAcc {
  accountName: string;
  prefix: string;
  key: string;
  platform: string;
  spend: number;
  revenue: number;
  conversions: number;
  /** key: campaign 名稱 */
  campaigns: Map<string, CampaignAcc>;
}

/** 將原始廣告記錄依「帳號＋前綴」合併為行銷活動列 */
export function aggregateInitiatives(
  records: WindsorAdRecord[],
  days = 0,
): InitiativeRow[] {
  const map = new Map<string, InitiativeAcc>();

  for (const r of records) {
    const { accountName, prefix, key } = initiativeKey(
      r.campaign,
      r.account_name,
    );

    let init = map.get(key);
    if (!init) {
      init = {
        accountName,
        prefix,
        key,
        platform: platformLabel(r.source),
        spend: 0,
        revenue: 0,
        conversions: 0,
        campaigns: new Map(),
      };
      map.set(key, init);
    }

    // 可加總指標
    init.spend += r.spend;
    init.revenue += r.revenue;
    init.conversions += r.conversions;

    // campaign 明細
    const campName = r.campaign?.trim() || "未命名";
    let camp = init.campaigns.get(campName);
    if (!camp) {
      camp = {
        campaign: campName,
        spend: 0,
        revenue: 0,
        conversions: 0,
        lifetimeBudget: 0,
        dailyBudget: 0,
        status: "",
        statusDate: "",
      };
      init.campaigns.set(campName, camp);
    }
    camp.spend += r.spend;
    camp.revenue += r.revenue;
    camp.conversions += r.conversions;
    // 預算快照：跨日取最大值（勿加總）
    camp.lifetimeBudget = Math.max(
      camp.lifetimeBudget,
      r.campaignLifetimeBudget,
    );
    camp.dailyBudget = Math.max(camp.dailyBudget, r.campaignDailyBudget);
    // 狀態取最新日期那筆（日期為 YYYY-MM-DD，字串比較即可）
    if (r.date >= camp.statusDate) {
      camp.status = r.campaignStatus;
      camp.statusDate = r.date;
    }
  }

  const rows: InitiativeRow[] = [];
  for (const init of map.values()) {
    // 預算跨 campaign 加總（快照已在 campaign 層去重）
    let lifetimeBudget = 0;
    let dailyBudget = 0;
    const campaigns: InitiativeCampaign[] = [];
    for (const c of init.campaigns.values()) {
      lifetimeBudget += c.lifetimeBudget;
      dailyBudget += c.dailyBudget;
      campaigns.push({
        campaign: c.campaign,
        spend: c.spend,
        revenue: c.revenue,
        conversions: c.conversions,
        roas: c.spend > 0 ? c.revenue / c.spend : 0,
        cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
        lifetimeBudget: c.lifetimeBudget,
        dailyBudget: c.dailyBudget,
        status: c.status,
      });
    }

    const hasBudget = lifetimeBudget > 0;
    const budget = lifetimeBudget;

    // 配速推算：只計 ACTIVE 且無 lifetime 的活動日預算（lifetime 活動走消耗語意）
    let activeDailyBudget = 0;
    for (const c of init.campaigns.values()) {
      if (c.lifetimeBudget === 0 && c.status === "ACTIVE") {
        activeDailyBudget += c.dailyBudget;
      }
    }
    const periodBudget = hasBudget ? 0 : activeDailyBudget * days;

    rows.push({
      accountName: init.accountName,
      prefix: init.prefix,
      key: init.key,
      platform: init.platform,
      spend: init.spend,
      revenue: init.revenue,
      conversions: init.conversions,
      roas: init.spend > 0 ? init.revenue / init.spend : 0,
      cpa: init.conversions > 0 ? init.spend / init.conversions : 0,
      lifetimeBudget,
      dailyBudget,
      budget,
      hasBudget,
      progress: hasBudget ? init.spend / budget : 0,
      periodBudget,
      pacingProgress: periodBudget > 0 ? init.spend / periodBudget : 0,
      campaigns,
    });
  }

  return rows;
}

/** 期間天數：取資料中的不重複日期數（含今天時當天未跑完，進度會略偏低）*/
export function countDistinctDates(records: WindsorAdRecord[]): number {
  return new Set(records.map((r) => r.date)).size;
}

/** 帳號內單一 campaign 的預算/狀態累加狀態 */
interface AccountCampaignAcc {
  lifetimeBudget: number;
  dailyBudget: number;
  status: string;
  statusDate: string;
}

/** 帳號內部的可變累加狀態 */
interface AccountAcc {
  accountName: string;
  platform: string;
  spend: number;
  /** key: campaign 名稱 */
  campaigns: Map<string, AccountCampaignAcc>;
}

/** 帳號手動月預算選項 */
export interface AccountBudgetOptions {
  /** 帳號名稱 → 手動月預算（原幣別） */
  manualBudgets: Record<string, number>;
  /** 當月天數（呼叫端以使用者當下月份計算） */
  daysInMonth: number;
}

/** 將原始廣告記錄彙總為帳號層級的預算配速摘要（依花費由高到低）*/
export function aggregateAccounts(
  records: WindsorAdRecord[],
  days: number,
  budgetOptions?: AccountBudgetOptions,
): AccountSummary[] {
  const map = new Map<string, AccountAcc>();

  for (const r of records) {
    const accountName = r.account_name?.trim() || "未命名帳戶";
    let acc = map.get(accountName);
    if (!acc) {
      acc = {
        accountName,
        platform: platformLabel(r.source),
        spend: 0,
        campaigns: new Map(),
      };
      map.set(accountName, acc);
    }
    // 花費計入全部活動（含已暫停）
    acc.spend += r.spend;

    const campName = r.campaign?.trim() || "未命名";
    let camp = acc.campaigns.get(campName);
    if (!camp) {
      camp = { lifetimeBudget: 0, dailyBudget: 0, status: "", statusDate: "" };
      acc.campaigns.set(campName, camp);
    }
    // 預算快照：跨日取最大值（勿加總）
    camp.lifetimeBudget = Math.max(
      camp.lifetimeBudget,
      r.campaignLifetimeBudget,
    );
    camp.dailyBudget = Math.max(camp.dailyBudget, r.campaignDailyBudget);
    // 狀態取最新日期那筆
    if (r.date >= camp.statusDate) {
      camp.status = r.campaignStatus;
      camp.statusDate = r.date;
    }
  }

  const summaries: AccountSummary[] = [];
  for (const acc of map.values()) {
    let periodBudget = 0;
    for (const c of acc.campaigns.values()) {
      if (c.lifetimeBudget > 0) {
        // lifetime 為總額上限，比推算值可信，直接計入（不乘天數）
        periodBudget += c.lifetimeBudget;
      } else if (c.status === "ACTIVE") {
        periodBudget += c.dailyBudget * days;
      }
    }

    // 手動月預算優先：換算成期間預算，覆寫 API 推算值
    const manual = budgetOptions?.manualBudgets[acc.accountName] ?? 0;
    const daysInMonth = budgetOptions?.daysInMonth ?? 0;
    let budgetSource: "manual" | "api" | undefined;
    let monthlyBudget: number | undefined;
    if (manual > 0 && daysInMonth > 0) {
      periodBudget = (manual / daysInMonth) * days;
      budgetSource = "manual";
      monthlyBudget = manual;
    }

    const hasBudget = periodBudget > 0;
    if (budgetSource === undefined && hasBudget) {
      budgetSource = "api";
    }
    summaries.push({
      accountName: acc.accountName,
      platform: acc.platform,
      spend: acc.spend,
      periodBudget,
      hasBudget,
      progress: hasBudget ? acc.spend / periodBudget : 0,
      budgetSource,
      monthlyBudget,
    });
  }

  // 依花費由高到低（帳號卡片顯示順序）
  return summaries.sort((a, b) => b.spend - a.spend);
}

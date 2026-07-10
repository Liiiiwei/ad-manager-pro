import type { Client } from "@notionhq/client";
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { AccountSummary } from "@/lib/initiatives/types";
import type { DigestDates } from "@/lib/digest/build-daily-summary";
import { withNotionThrottle } from "./client";
import { PROP } from "./database-schemas";
import {
  buildDailyRowProperties,
  makeSyncKey,
  type DailyPerformanceRow,
} from "./property-builders";

/** 昨日單帳號的可加總指標 */
interface YesterdayAcc {
  spend: number;
  revenue: number;
  conversions: number;
}

/**
 * 昨日 records 按帳號聚合出昨日指標，join accounts（AccountSummary）拿月配速欄位（純函式）。
 * 以 accounts 為基底：帳號在 accounts 有、昨日無花費 → 仍出 row（花費 0，ROAS/CPA 留空）。
 * accounts 來自本月 records 聚合、昨日 ⊆ 本月，故不會有「昨日有花費但 accounts 沒有」的帳號。
 */
export function buildDailyPerformanceRows(
  records: WindsorAdRecord[],
  accounts: AccountSummary[],
  dates: DigestDates,
): DailyPerformanceRow[] {
  const yesterday = dates.yesterday;

  // 昨日指標按帳號聚合（帳號名淨化比照 aggregateAccounts）
  const agg = new Map<string, YesterdayAcc>();
  for (const r of records) {
    if (r.date !== yesterday) continue;
    const accountName = r.account_name?.trim() || "未命名帳戶";
    let acc = agg.get(accountName);
    if (!acc) {
      acc = { spend: 0, revenue: 0, conversions: 0 };
      agg.set(accountName, acc);
    }
    acc.spend += r.spend;
    acc.revenue += r.revenue;
    acc.conversions += r.conversions;
  }

  return accounts.map((account) => {
    const y = agg.get(account.accountName) ?? {
      spend: 0,
      revenue: 0,
      conversions: 0,
    };
    return {
      date: yesterday,
      accountName: account.accountName,
      platform: account.platform,
      spend: y.spend,
      revenue: y.revenue,
      conversions: y.conversions,
      // 除零一律留空（null），不寫 0 造成誤讀
      roas: y.spend > 0 ? y.revenue / y.spend : null,
      cpa: y.conversions > 0 ? y.spend / y.conversions : null,
      monthSpend: account.spend,
      pacingRatio: account.hasBudget ? account.progress : null,
      budgetSource: account.budgetSource ?? null,
      monthlyBudget: account.monthlyBudget ?? null,
      syncKey: makeSyncKey(yesterday, account.accountName),
    };
  });
}

/** 從 Notion page 物件取 rich_text property 的 plain_text（未驗證回應，寬鬆讀取） */
function richTextPlain(page: unknown, propName: string): string | null {
  const props = (page as { properties?: Record<string, unknown> }).properties;
  const prop = props?.[propName] as
    { rich_text?: Array<{ plain_text?: string }> } | undefined;
  if (!prop || !Array.isArray(prop.rich_text)) return null;
  const text = prop.rich_text.map((t) => t.plain_text ?? "").join("");
  return text || null;
}

/**
 * 每日成效 upsert（§3.1）：以「同步鍵」`{date}::{accountName}` 為唯一鍵。
 * 先查當日已存在的 row（日期 filter，一次查回），命中 → pages.update 覆寫全部 app 欄位；
 * 未命中 → pages.create。同一天重跑天然冪等。
 *
 * 單筆寫入失敗：記 log 後 continue，其餘筆照寫；結尾若有任何筆失敗則拋錯，
 * 由呼叫端把「每日成效」子任務記為失敗（計入 PARTIAL）。
 */
export async function upsertDailyRows(
  notion: Client,
  dataSourceId: string,
  rows: DailyPerformanceRow[],
): Promise<{ created: number; updated: number }> {
  if (rows.length === 0) return { created: 0, updated: 0 };
  const date = rows[0].date; // 全部 row 同一基準日（昨日）

  // 查當日既有 row，建 同步鍵 → pageId 的 map（帳號數 < 100 單頁即足，仍處理 has_more 以防萬一）
  const existing = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res = await withNotionThrottle(() =>
      notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: { property: PROP.daily.date, date: { equals: date } },
        page_size: 100,
        start_cursor: cursor,
      }),
    );
    for (const page of res.results) {
      const key = richTextPlain(page, PROP.daily.syncKey);
      if (key) existing.set(key, page.id);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  let created = 0;
  let updated = 0;
  const failures: string[] = [];
  for (const row of rows) {
    try {
      const properties = buildDailyRowProperties(row);
      const pageId = existing.get(row.syncKey);
      if (pageId) {
        await withNotionThrottle(() =>
          notion.pages.update({ page_id: pageId, properties }),
        );
        updated += 1;
      } else {
        await withNotionThrottle(() =>
          notion.pages.create({
            parent: { type: "data_source_id", data_source_id: dataSourceId },
            properties,
          }),
        );
        created += 1;
      }
    } catch (error) {
      console.error(
        `[notion-sync] 每日成效 row 寫入失敗（${row.syncKey}）:`,
        error,
      );
      failures.push(row.syncKey);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${rows.length} 筆寫入失敗（已成功 建${created}更新${updated}）`,
    );
  }
  return { created, updated };
}

import type { Client } from "@notionhq/client";
import { prisma } from "@/lib/db/prisma";
import { withNotionThrottle } from "./client";
import { buildChangeLogProperties } from "./property-builders";

/**
 * 操作日誌推送（§3.2）：去重錨點在 app 側（BudgetChangeLog.notionPageId），不用 Notion 查詢去重。
 * 查 notionPageId IS NULL → 逐筆 pages.create → 成功一筆立刻回寫一筆（crash-safe：
 * 回寫前掛掉下輪最多重建一頁，靠「系統ID」property 可人工辨識，偏向重複而非遺漏）。
 *
 * app 對操作日誌 DB 只 create、永不 update——投手手動補的欄位永不被覆寫。
 * 首次啟用時全量 backfill 歷史紀錄（changelog 筆數量級小，不設時間窗）。
 *
 * @returns 本次成功建立的頁數；任何單筆失敗會在全部嘗試後拋錯（子任務失敗語意）
 */
export async function pushChangeLogsToNotion(
  notion: Client,
  dataSourceId: string,
  userId: string,
): Promise<number> {
  const pending = await prisma.budgetChangeLog.findMany({
    where: { userId, notionPageId: null },
    orderBy: { detectedAt: "asc" },
  });

  let created = 0;
  const failures: string[] = [];
  for (const log of pending) {
    try {
      const page = await withNotionThrottle(() =>
        notion.pages.create({
          parent: { type: "data_source_id", data_source_id: dataSourceId },
          properties: buildChangeLogProperties(log),
        }),
      );
      await prisma.budgetChangeLog.update({
        where: { id: log.id },
        data: { notionPageId: page.id },
      });
      created += 1;
    } catch (error) {
      console.error(`[notion-sync] 操作日誌建頁失敗（id=${log.id}）:`, error);
      failures.push(log.id);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${pending.length} 筆建立失敗（已成功 ${created} 筆，已回寫不會重推）`,
    );
  }
  return created;
}

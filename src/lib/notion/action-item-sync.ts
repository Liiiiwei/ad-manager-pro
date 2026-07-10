import type { Client } from "@notionhq/client";
import { prisma } from "@/lib/db/prisma";
import { withNotionThrottle } from "./client";
import { PROP } from "./database-schemas";
import { buildActionItemProperties } from "./property-builders";

/** 終態鏡射時間窗（毫秒）：7 天，把每輪 update 數封頂；7 天前已終態者早已鏡射過，冪等 */
const TERMINAL_MIRROR_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
 * 待辦讀回（§4）：查「待辦」DB 已勾『完成』的 row，app 端仍 open 者標 resolved。
 * 必須在 pushActionItemsToNotion 之前執行——同輪內 app 狀態就是最新，
 * 推送才不會把使用者剛勾掉的項目又蓋回未完成。
 *
 * 半雙向的邊界就是「勾掉 → resolved」單一路徑：
 * 反向操作（在 Notion 把已完成的取消勾選）刻意不讀回，
 * 下輪推送會把 app 端終態重新蓋回 checkbox，Notion 端的取消勾選會被還原。
 *
 * @returns 本次標記 resolved 的筆數
 */
export async function pullResolvedFromNotion(
  notion: Client,
  todoDataSourceId: string,
  userId: string,
): Promise<number> {
  // 分頁迴圈收集所有已勾完成 row 的「系統ID」
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await withNotionThrottle(() =>
      notion.dataSources.query({
        data_source_id: todoDataSourceId,
        filter: { property: PROP.todo.done, checkbox: { equals: true } },
        page_size: 100,
        start_cursor: cursor,
      }),
    );
    for (const page of res.results) {
      const id = richTextPlain(page, PROP.todo.systemId);
      if (id) ids.push(id);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  if (ids.length === 0) return 0;

  // 一次 DB 寫入；userId 雙條件拒絕跨租戶；status: "open" 條件保證
  // app 已 resolved（含配速回正自動結案）或 dismissed 的不重複改，冪等
  const result = await prisma.budgetActionItem.updateMany({
    where: { id: { in: ids }, userId, status: "open" },
    data: {
      status: "resolved",
      resolvedBy: "notion_checkbox",
      resolvedAt: new Date(),
    },
  });
  return result.count;
}

/**
 * 待辦推送（§3.3）三條規則：
 * - notionPageId == null 且 open → pages.create，回寫 notionPageId
 *   （resolved/dismissed 且從未推送過的不補建——沒上過 Notion 的歷史待辦不回填）
 * - notionPageId != null 且 open → pages.update 鏡射嚴重度/摘要（digest 每天更新 detail）
 * - notionPageId != null 且 resolved/dismissed 且終態時間（resolvedAt，dismissed 無 resolvedAt
 *   則 createdAt）在 7 天內 → pages.update 鏡射 完成/狀態/解決日/解決方式
 * app 只寫 app 欄位，永不碰「備註」（buildActionItemProperties 已保證）。
 *
 * @param now 時間基準（測試可注入；預設當下）
 */
export async function pushActionItemsToNotion(
  notion: Client,
  dataSourceId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ created: number; updated: number }> {
  const windowStart = new Date(now.getTime() - TERMINAL_MIRROR_WINDOW_MS);
  const items = await prisma.budgetActionItem.findMany({
    where: {
      userId,
      OR: [
        // open：未推送的建頁、已推送的鏡射更新
        { status: "open" },
        // 已推送且 7 天內進入終態（resolved/dismissed）：鏡射終態
        {
          notionPageId: { not: null },
          status: { in: ["resolved", "dismissed"] },
          OR: [
            { resolvedAt: { gte: windowStart } },
            { resolvedAt: null, createdAt: { gte: windowStart } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let updated = 0;
  const failures: string[] = [];
  for (const item of items) {
    try {
      // 防禦：終態且從未推送過 → 不補建（正常情況已被查詢條件排除）
      if (!item.notionPageId && item.status !== "open") continue;

      const properties = buildActionItemProperties(item);
      if (item.notionPageId) {
        await withNotionThrottle(() =>
          notion.pages.update({
            page_id: item.notionPageId!,
            properties,
          }),
        );
        updated += 1;
      } else {
        const page = await withNotionThrottle(() =>
          notion.pages.create({
            parent: { type: "data_source_id", data_source_id: dataSourceId },
            properties,
          }),
        );
        await prisma.budgetActionItem.update({
          where: { id: item.id },
          data: { notionPageId: page.id },
        });
        created += 1;
      }
    } catch (error) {
      console.error(`[notion-sync] 待辦推送失敗（id=${item.id}）:`, error);
      failures.push(item.id);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${items.length} 筆推送失敗（已成功 建${created}更新${updated}）`,
    );
  }
  return { created, updated };
}

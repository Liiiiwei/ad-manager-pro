import {
  APIErrorCode,
  isNotionClientError,
  type Client,
  type CreateDatabaseResponse,
} from "@notionhq/client";
import { withNotionThrottle } from "./client";
import {
  DAILY_DB_PROPERTIES,
  CHANGELOG_DB_PROPERTIES,
  TODO_DB_PROPERTIES,
  DB_TITLES,
  type NotionDataSourceProperties,
} from "./database-schemas";

/** 一個 Notion database 的雙 ID（2025-09-03 API：查詢/建 row 都用 dataSourceId） */
export interface NotionDatabaseRef {
  databaseId: string;
  dataSourceId: string;
}

/** UserSettings.notionDatabases JSON 欄位的結構 */
export interface NotionDatabaseIds {
  version: 1; // schema 版本，未來欄位演進用
  daily: NotionDatabaseRef;
  changelog: NotionDatabaseRef;
  todo: NotionDatabaseRef;
}

/** 三個 DB 的鍵名 */
export type NotionDatabaseKey = "daily" | "changelog" | "todo";

const DB_KEYS: NotionDatabaseKey[] = ["daily", "changelog", "todo"];

const DB_PROPERTIES: Record<NotionDatabaseKey, NotionDataSourceProperties> = {
  daily: DAILY_DB_PROPERTIES,
  changelog: CHANGELOG_DB_PROPERTIES,
  todo: TODO_DB_PROPERTIES,
};

function isValidRef(value: unknown): value is NotionDatabaseRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.databaseId === "string" &&
    ref.databaseId.length > 0 &&
    typeof ref.dataSourceId === "string" &&
    ref.dataSourceId.length > 0
  );
}

/**
 * 淨化未驗證 JSON（settings.notionDatabases 原始值），比照 mergeAccountBudgets 的態度：
 * 結構不完整就整份作廢回 null，不做部分修補。
 */
export function parseNotionDatabaseIds(raw: unknown): NotionDatabaseIds | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (
    !isValidRef(obj.daily) ||
    !isValidRef(obj.changelog) ||
    !isValidRef(obj.todo)
  ) {
    return null;
  }
  return {
    version: 1,
    daily: {
      databaseId: obj.daily.databaseId,
      dataSourceId: obj.daily.dataSourceId,
    },
    changelog: {
      databaseId: obj.changelog.databaseId,
      dataSourceId: obj.changelog.dataSourceId,
    },
    todo: {
      databaseId: obj.todo.databaseId,
      dataSourceId: obj.todo.dataSourceId,
    },
  };
}

/** object_not_found 視為「DB 已被刪」→ 重建；其他錯誤原樣拋出（整輪 FAILED 的語意由呼叫端處理） */
function isObjectNotFound(error: unknown): boolean {
  return (
    isNotionClientError(error) && error.code === APIErrorCode.ObjectNotFound
  );
}

/** 驗證既存 ref 是否仍可用：retrieve 成功且未被 archive/trash */
async function isRefAlive(
  notion: Client,
  ref: NotionDatabaseRef,
): Promise<boolean> {
  try {
    const ds = await withNotionThrottle(() =>
      notion.dataSources.retrieve({ data_source_id: ref.dataSourceId }),
    );
    const flags = ds as { archived?: boolean; in_trash?: boolean };
    return flags.archived !== true && flags.in_trash !== true;
  } catch (error) {
    if (isObjectNotFound(error)) return false;
    throw error;
  }
}

/** 建立單一 database 並取回雙 ID */
async function createDatabase(
  notion: Client,
  parentPageId: string,
  key: NotionDatabaseKey,
): Promise<NotionDatabaseRef> {
  const db: CreateDatabaseResponse = await withNotionThrottle(() =>
    notion.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: DB_TITLES[key] } }],
      initial_data_source: { properties: DB_PROPERTIES[key] },
    }),
  );
  const dataSources = (db as { data_sources?: Array<{ id: string }> })
    .data_sources;
  const dataSourceId = dataSources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(
      `Notion database「${DB_TITLES[key]}」建立成功但回應缺 data_sources`,
    );
  }
  return { databaseId: db.id, dataSourceId };
}

/**
 * 確保三個 Notion database 存在（lazy 建立／遺失重建）。
 *
 * @param stored settings.notionDatabases 原始值（未驗證 JSON）
 * @returns ids：可用的三組雙 ID；changed：true 時呼叫端負責把 ids 寫回
 *   UserSettings.notionDatabases（updateUserSettings）；rebuilt：本輪新建的 DB 鍵，
 *   呼叫端（T3）據此清空對應表的 notionPageId 觸發全量重推（daily 無需善後）。
 *
 * 行為：
 * - stored 解析失敗或缺鍵 → 視為全新，三個都建（都計入 rebuilt，清 null 的 pageId 是無害 no-op）
 * - 既存 ref 逐一 retrieve 驗證；object_not_found 或 archived/in_trash → 就地重建
 * - 其他錯誤（unauthorized、網路…）原樣拋出，由呼叫端記整輪 FAILED
 */
export async function ensureNotionDatabases(
  notion: Client,
  parentPageId: string,
  stored: unknown,
): Promise<{
  ids: NotionDatabaseIds;
  changed: boolean;
  rebuilt: NotionDatabaseKey[];
}> {
  const parsed = parseNotionDatabaseIds(stored);
  const refs: Partial<Record<NotionDatabaseKey, NotionDatabaseRef>> = {};
  const rebuilt: NotionDatabaseKey[] = [];

  for (const key of DB_KEYS) {
    const existing = parsed?.[key];
    if (existing && (await isRefAlive(notion, existing))) {
      refs[key] = existing;
      continue;
    }
    refs[key] = await createDatabase(notion, parentPageId, key);
    rebuilt.push(key);
  }

  const ids: NotionDatabaseIds = {
    version: 1,
    daily: refs.daily!,
    changelog: refs.changelog!,
    todo: refs.todo!,
  };
  return { ids, changed: rebuilt.length > 0, rebuilt };
}

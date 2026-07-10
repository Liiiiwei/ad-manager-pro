import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIErrorCode, APIResponseError, type Client } from "@notionhq/client";
import {
  parseNotionDatabaseIds,
  ensureNotionDatabases,
  type NotionDatabaseIds,
} from "../databases";
import { DB_TITLES } from "../database-schemas";

/** 建構真實 APIResponseError（isNotionClientError 是 instanceof 檢查，plain object 不會被認出） */
function apiError(code: APIErrorCode, status: number): APIResponseError {
  return new APIResponseError({
    code,
    status,
    message: `mock ${code}`,
    headers: new Headers(),
    rawBodyText: "",
    additional_data: undefined,
    request_id: undefined,
  });
}

const VALID_STORED: NotionDatabaseIds = {
  version: 1,
  daily: { databaseId: "db-d", dataSourceId: "ds-d" },
  changelog: { databaseId: "db-c", dataSourceId: "ds-c" },
  todo: { databaseId: "db-t", dataSourceId: "ds-t" },
};

describe("parseNotionDatabaseIds", () => {
  it("合法結構原樣解析（多餘欄位剝除）", () => {
    const raw = { ...VALID_STORED, extra: "junk" };
    expect(parseNotionDatabaseIds(raw)).toEqual(VALID_STORED);
  });

  it("非物件／null／陣列 → null", () => {
    expect(parseNotionDatabaseIds(null)).toBeNull();
    expect(parseNotionDatabaseIds("junk")).toBeNull();
    expect(parseNotionDatabaseIds([VALID_STORED])).toBeNull();
  });

  it("version 不是 1 → null", () => {
    expect(parseNotionDatabaseIds({ ...VALID_STORED, version: 2 })).toBeNull();
  });

  it("缺任一 DB 鍵或 ref 欄位為空字串 → 整份作廢回 null", () => {
    const { todo: _todo, ...missingTodo } = VALID_STORED;
    expect(parseNotionDatabaseIds(missingTodo)).toBeNull();
    expect(
      parseNotionDatabaseIds({
        ...VALID_STORED,
        daily: { databaseId: "", dataSourceId: "ds-d" },
      }),
    ).toBeNull();
  });
});

describe("ensureNotionDatabases", () => {
  const retrieve = vi.fn();
  const create = vi.fn();
  const notion = {
    dataSources: { retrieve },
    databases: { create },
  } as unknown as Client;

  /** create mock：依標題回對應的假雙 ID */
  const TITLE_TO_IDS: Record<string, { id: string; ds: string }> = {
    [DB_TITLES.daily]: { id: "new-db-d", ds: "new-ds-d" },
    [DB_TITLES.changelog]: { id: "new-db-c", ds: "new-ds-c" },
    [DB_TITLES.todo]: { id: "new-db-t", ds: "new-ds-t" },
  };

  function mockCreateOk() {
    create.mockImplementation(
      (args: { title: Array<{ text: { content: string } }> }) => {
        const ids = TITLE_TO_IDS[args.title[0].text.content];
        return Promise.resolve({
          id: ids.id,
          data_sources: [{ id: ids.ds, name: args.title[0].text.content }],
        });
      },
    );
  }

  beforeEach(() => {
    retrieve.mockReset();
    create.mockReset();
  });

  it("stored 為 null（全新使用者）→ 三個都建，全部計入 rebuilt", async () => {
    mockCreateOk();
    const result = await ensureNotionDatabases(notion, "parent-page", null);
    expect(retrieve).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(3);
    // 建立時 parent 指向設定的父頁
    expect(create.mock.calls[0][0].parent).toEqual({
      type: "page_id",
      page_id: "parent-page",
    });
    expect(result.changed).toBe(true);
    expect(result.rebuilt).toEqual(["daily", "changelog", "todo"]);
    expect(result.ids).toEqual({
      version: 1,
      daily: { databaseId: "new-db-d", dataSourceId: "new-ds-d" },
      changelog: { databaseId: "new-db-c", dataSourceId: "new-ds-c" },
      todo: { databaseId: "new-db-t", dataSourceId: "new-ds-t" },
    });
  });

  it("stored 有效且三個都活著 → 不建、不變", async () => {
    retrieve.mockResolvedValue({ archived: false, in_trash: false });
    const result = await ensureNotionDatabases(
      notion,
      "parent-page",
      VALID_STORED,
    );
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect(create).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.rebuilt).toEqual([]);
    expect(result.ids).toEqual(VALID_STORED);
  });

  it("其中一個被 archive → 只重建那一個", async () => {
    mockCreateOk();
    retrieve.mockImplementation(
      ({ data_source_id }: { data_source_id: string }) =>
        Promise.resolve({
          archived: data_source_id === "ds-c",
          in_trash: false,
        }),
    );
    const result = await ensureNotionDatabases(
      notion,
      "parent-page",
      VALID_STORED,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.rebuilt).toEqual(["changelog"]);
    expect(result.changed).toBe(true);
    expect(result.ids.daily).toEqual(VALID_STORED.daily);
    expect(result.ids.changelog).toEqual({
      databaseId: "new-db-c",
      dataSourceId: "new-ds-c",
    });
    expect(result.ids.todo).toEqual(VALID_STORED.todo);
  });

  it("retrieve 回 object_not_found（DB 被刪）→ 重建該 DB", async () => {
    mockCreateOk();
    retrieve.mockImplementation(
      ({ data_source_id }: { data_source_id: string }) =>
        data_source_id === "ds-d"
          ? Promise.reject(apiError(APIErrorCode.ObjectNotFound, 404))
          : Promise.resolve({ archived: false, in_trash: false }),
    );
    const result = await ensureNotionDatabases(
      notion,
      "parent-page",
      VALID_STORED,
    );
    expect(result.rebuilt).toEqual(["daily"]);
    expect(result.ids.daily).toEqual({
      databaseId: "new-db-d",
      dataSourceId: "new-ds-d",
    });
  });

  it("retrieve 拋其他錯誤（如 unauthorized）→ 原樣拋出、不建任何 DB", async () => {
    retrieve.mockRejectedValue(apiError(APIErrorCode.Unauthorized, 401));
    await expect(
      ensureNotionDatabases(notion, "parent-page", VALID_STORED),
    ).rejects.toMatchObject({ code: APIErrorCode.Unauthorized });
    expect(create).not.toHaveBeenCalled();
  });

  it("create 回應缺 data_sources → 拋中文錯誤", async () => {
    create.mockResolvedValue({ id: "new-db-x" }); // 無 data_sources
    await expect(
      ensureNotionDatabases(notion, "parent-page", null),
    ).rejects.toThrow(/每日成效.*data_sources/);
  });
});

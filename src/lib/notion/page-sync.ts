import { Client } from "@notionhq/client";

/**
 * 初始化 Notion Client
 */
function initNotionClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

/**
 * 將 Markdown 內容轉換為 Notion Blocks
 * 簡單實作：將內容按段落切分，每個段落變成一個 paragraph block
 */
function markdownToBlocks(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: any[] = [];

  let currentParagraph: string[] = [];

  for (const line of lines) {
    // 空行視為段落分隔
    if (line.trim() === "") {
      if (currentParagraph.length > 0) {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: currentParagraph.join("\n"),
                },
              },
            ],
          },
        });
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(line);
  }

  // 處理最後一個段落
  if (currentParagraph.length > 0) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: currentParagraph.join("\n"),
            },
          },
        ],
      },
    });
  }

  return blocks;
}

/**
 * 建立 Notion Page
 *
 * @param parentPageId - Notion Parent Page ID
 * @param title - 頁面標題
 * @param markdownContent - Markdown 格式的內容
 * @param notionApiKey - Notion API Key
 * @returns 建立的 page ID
 */
export async function createNotionPage(
  parentPageId: string,
  title: string,
  markdownContent: string,
  notionApiKey: string
): Promise<string> {
  const notion = initNotionClient(notionApiKey);

  try {
    const blocks = markdownToBlocks(markdownContent);

    const response = await notion.pages.create({
      parent: {
        type: "page_id",
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
      children: blocks,
    });

    console.log(`✅ Notion Page 建立成功: ${response.id}`);
    return response.id;
  } catch (error) {
    console.error("❌ Notion API 錯誤:", error);
    throw new Error(
      `無法建立 Notion Page: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

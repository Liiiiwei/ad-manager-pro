/** LINE 純文字訊息 */
export interface LineTextMessage {
  type: "text";
  text: string;
}

/** LINE Flex 訊息（altText 為通知列預覽文字，不可為空） */
export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

/** 推播結果：一律回傳結構化結果，不 throw */
export interface LinePushResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

/**
 * 推播訊息到 LINE（Messaging API push）
 * 任何失敗（非 2xx、429、網路錯誤）都回 { ok: false }，絕不 throw —
 * 呼叫端（cron 任務）依此決定記 log 放棄，不會炸掉整個排程。
 */
export async function pushLineMessage(
  channelToken: string,
  to: string,
  messages: LineMessage[],
): Promise<LinePushResult> {
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({ to, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 推播純文字訊息（Flex 組裝失敗時的備援通道） */
export function pushText(
  channelToken: string,
  to: string,
  text: string,
): Promise<LinePushResult> {
  return pushLineMessage(channelToken, to, [{ type: "text", text }]);
}

/** 推播 Flex bubble */
export function pushFlex(
  channelToken: string,
  to: string,
  bubble: Record<string, unknown>,
  altText: string,
): Promise<LinePushResult> {
  return pushLineMessage(channelToken, to, [
    { type: "flex", altText, contents: bubble },
  ]);
}

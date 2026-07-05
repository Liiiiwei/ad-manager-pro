"use client";

import { useState } from "react";
import { SettingsSection } from "./settings-section";
import { ToggleVisibility } from "./toggle-visibility";
import { ToggleField } from "./toggle-field";

/** LINE 區塊 props */
export interface LineSectionProps {
  channelToken: string;
  onChannelTokenChange: (value: string) => void;
  recipientId: string;
  onRecipientIdChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  hasToken: boolean;
  showToken: boolean;
  onToggleShowToken: () => void;
}

/** LINE 推播設定區塊 */
export function LineSection({
  channelToken,
  onChannelTokenChange,
  recipientId,
  onRecipientIdChange,
  enabled,
  onEnabledChange,
  hasToken,
  showToken,
  onToggleShowToken,
}: LineSectionProps) {
  // 測試推播狀態（區塊內部自理，不上提）
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // 測試推播：用「已儲存」的設定發一則測試訊息
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/line/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message });
      } else {
        setTestResult({ ok: false, message: data.error || "測試失敗" });
      }
    } catch {
      setTestResult({ ok: false, message: "測試失敗，請檢查網路連線" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsSection
      title="LINE 推播"
      description="每日 12:00 摘要與盤中異常提醒，推送到你的 LINE"
      badge={hasToken ? (enabled ? "已啟用" : "已停用") : undefined}
      badgeColor={
        enabled ? "text-success bg-success/10" : "text-muted bg-muted/10"
      }
      icon={
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      }
    >
      <div className="space-y-4">
        {/* 設定步驟說明（用 info token，不用硬色票） */}
        <div className="bg-info/10 border border-info/20 rounded-lg p-3 text-xs text-info space-y-1">
          <p className="font-medium">設定步驟：</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>到 LINE Developers Console 建立 Messaging API channel</li>
            <li>在 Messaging API 分頁發行 Channel access token（長效）</li>
            <li>
              用手機加該官方帳號為好友，並取得你的 userId（Basic settings 頁的
              Your user ID）
            </li>
          </ol>
        </div>

        {/* Channel Access Token */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Channel Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={channelToken}
              onChange={(e) => onChannelTokenChange(e.target.value)}
              placeholder={
                hasToken
                  ? "留空代表不變更已儲存的 Token"
                  : "貼上 LINE Channel Access Token..."
              }
              className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
            />
            <ToggleVisibility show={showToken} onToggle={onToggleShowToken} />
          </div>
        </div>

        {/* 接收者 userId */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            接收者 User ID
          </label>
          <input
            type="text"
            value={recipientId}
            onChange={(e) => onRecipientIdChange(e.target.value)}
            placeholder="U 開頭的 LINE userId..."
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
          />
        </div>

        {/* 啟用開關 */}
        <ToggleField
          label="啟用 LINE 每日摘要推播"
          checked={enabled}
          onChange={onEnabledChange}
        />

        {/* 測試推播（用已儲存的設定） */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 text-sm border border-card-border rounded-lg hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {testing ? "傳送中..." : "發送測試訊息"}
          </button>
          {testResult && (
            <span
              className={`text-sm animate-fade-in ${
                testResult.ok ? "text-success" : "text-danger"
              }`}
            >
              {testResult.message}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          測試使用「已儲存」的設定——修改 Token
          後請先按下方「儲存所有設定」再測試。
        </p>
      </div>
    </SettingsSection>
  );
}

import { SettingsSection } from "./settings-section";
import { ToggleVisibility } from "./toggle-visibility";
import { ToggleField } from "./toggle-field";

/** Notion 區塊 props */
export interface NotionSectionProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  parentPageId: string;
  onParentPageIdChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  hasConfig: boolean;
  showKey: boolean;
  onToggleShowKey: () => void;
}

/** Notion 自動同步設定區塊 */
export function NotionSection({
  apiKey,
  onApiKeyChange,
  parentPageId,
  onParentPageIdChange,
  enabled,
  onEnabledChange,
  hasConfig,
  showKey,
  onToggleShowKey,
}: NotionSectionProps) {
  return (
    <SettingsSection
      title="Notion 自動同步"
      description="設定自動每日同步廣告報告到 Notion。系統會根據排程時間自動產生報告並建立 Notion 頁面。"
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
            strokeWidth={1.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      }
      badge={hasConfig ? (enabled ? "已啟用" : "已停用") : undefined}
      badgeColor={
        enabled ? "text-success bg-green-50" : "text-muted bg-gray-50"
      }
    >
      {/* 設定步驟說明 */}
      <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3.5 mb-4">
        <h4 className="text-xs font-semibold text-blue-800 mb-2">設定步驟</h4>
        <ol className="text-xs text-blue-700 space-y-1.5 pl-4 list-decimal">
          <li>
            前往{" "}
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline font-medium"
            >
              Notion Integrations
            </a>
            ，建立 Integration 並複製 API Key
          </li>
          <li>在 Notion 建立頁面，邀請 Integration，複製 Page ID</li>
          <li>在下方輸入資訊並儲存即可啟用</li>
        </ol>
      </div>

      <div className="mb-3">
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          Notion API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={
              hasConfig
                ? "留空代表不變更..."
                : "貼上 Notion Integration Token..."
            }
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
          />
          <ToggleVisibility show={showKey} onToggle={onToggleShowKey} />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          Notion Parent Page ID
        </label>
        <input
          type="text"
          value={parentPageId}
          onChange={(e) => onParentPageIdChange(e.target.value)}
          placeholder="貼上 Notion 頁面 ID（32 位字串）..."
          className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
        />
        <p className="text-[11px] text-muted mt-1">
          從 Notion 頁面 URL 中取得的 32 位字串
        </p>
      </div>

      <ToggleField
        label="啟用自動同步到 Notion"
        checked={enabled}
        onChange={onEnabledChange}
      />
    </SettingsSection>
  );
}

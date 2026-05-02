import { SettingsSection } from "./settings-section";
import { ToggleVisibility } from "./toggle-visibility";

/** Windsor 區塊 props */
export interface WindsorSectionProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
}

/** Windsor API Key 與日期範圍設定 */
export function WindsorSection({
  apiKey,
  onApiKeyChange,
  dateRange,
  onDateRangeChange,
  showKey,
  onToggleShowKey,
}: WindsorSectionProps) {
  return (
    <SettingsSection
      title="Windsor.ai API Key"
      description={
        <>
          輸入你的 Windsor.ai API Key 以連接廣告帳戶資料。可在{" "}
          <a
            href="https://onboard.windsor.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Windsor.ai 後台
          </a>{" "}
          取得。
        </>
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
            strokeWidth={1.5}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
      }
    >
      <div className="mb-3">
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="貼上你的 Windsor API Key..."
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
          />
          <ToggleVisibility show={showKey} onToggle={onToggleShowKey} />
        </div>
        <p className="text-[11px] text-muted mt-1">留空代表不變更現有設定</p>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          日期範圍
        </label>
        <select
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value)}
          className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
        >
          <option value="last_7d">過去 7 天</option>
          <option value="last_14d">過去 14 天</option>
          <option value="last_30d">過去 30 天</option>
        </select>
      </div>
    </SettingsSection>
  );
}

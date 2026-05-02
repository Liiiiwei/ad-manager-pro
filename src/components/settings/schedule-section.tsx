import { SettingsSection } from "./settings-section";
import { ToggleField } from "./toggle-field";

/** 排程區塊 props */
export interface ScheduleSectionProps {
  cronExpression: string;
  onCronExpressionChange: (value: string) => void;
  timezone: string;
  onTimezoneChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  hasConfig: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

/** 自動同步排程設定區塊 */
export function ScheduleSection({
  cronExpression,
  onCronExpressionChange,
  timezone,
  onTimezoneChange,
  enabled,
  onEnabledChange,
  hasConfig,
  nextRunAt,
  lastRunAt,
}: ScheduleSectionProps) {
  return (
    <SettingsSection
      title="自動同步排程"
      description="設定個人化排程時間，系統會在指定時間自動執行分析並同步到 Notion。"
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      }
    >
      <div className="mb-3">
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          Cron 排程表達式
        </label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => onCronExpressionChange(e.target.value)}
          placeholder="0 9 * * *"
          className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-mono transition-shadow"
        />
        <p className="text-[11px] text-muted mt-1">
          <code className="bg-gray-100 px-1 rounded text-[10px]">
            0 9 * * *
          </code>{" "}
          = 每天 9:00 /
          <code className="bg-gray-100 px-1 rounded text-[10px] ml-1">
            0 */6 * * *
          </code>{" "}
          = 每 6 小時
        </p>
      </div>

      <div className="mb-3">
        <label className="text-xs font-medium text-foreground mb-1.5 block">
          時區
        </label>
        <select
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
        >
          <option value="UTC">UTC</option>
          <option value="Asia/Taipei">Asia/Taipei (台北)</option>
          <option value="Asia/Hong_Kong">Asia/Hong_Kong (香港)</option>
          <option value="Asia/Tokyo">Asia/Tokyo (東京)</option>
          <option value="America/New_York">America/New_York (紐約)</option>
          <option value="America/Los_Angeles">
            America/Los_Angeles (洛杉磯)
          </option>
        </select>
      </div>

      <ToggleField
        label="啟用自動排程"
        checked={enabled}
        onChange={onEnabledChange}
      />

      {hasConfig && (
        <div className="bg-gray-50 rounded-lg p-3 mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">上次執行</span>
            <span className="text-foreground font-mono text-[11px]">
              {lastRunAt
                ? new Date(lastRunAt).toLocaleString("zh-TW")
                : "尚未執行"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">下次執行</span>
            <span className="text-accent font-mono font-medium text-[11px]">
              {nextRunAt
                ? new Date(nextRunAt).toLocaleString("zh-TW")
                : "計算中..."}
            </span>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

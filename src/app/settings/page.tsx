"use client";

import { useState, useEffect } from "react";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";
import { setApiKey } from "@/hooks/use-windsor-data";

export default function SettingsPage() {
  // Windsor 設定
  const [windsorApiKey, setWindsorApiKey] = useState("");
  const [windsorDateRange, setWindsorDateRange] = useState("last_7d");
  const [showWindsorKey, setShowWindsorKey] = useState(false);

  // Notion 設定
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionParentPageId, setNotionParentPageId] = useState("");
  const [notionEnabled, setNotionEnabled] = useState(true);
  const [hasNotionConfig, setHasNotionConfig] = useState(false);
  const [showNotionKey, setShowNotionKey] = useState(false);

  // 排程設定
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("Asia/Taipei");
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [hasScheduleConfig, setHasScheduleConfig] = useState(false);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  // 閾值設定
  const [thresholds, setThresholds] =
    useState<AnalysisThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdDirty, setThresholdDirty] = useState(false);

  // UI 狀態
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "success" | "partial" | "fail" | null
  >(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (data.error) return;

        if (data.windsor) {
          setWindsorDateRange(data.windsor.dateRange || "last_7d");
        }

        if (data.notion) {
          setHasNotionConfig(data.notion.configured);
          setNotionParentPageId(data.notion.parentPageId || "");
          setNotionEnabled(data.notion.enabled ?? true);
        }

        if (data.thresholds) {
          setThresholds(data.thresholds);
        }
      } catch (err) {
        console.warn("設定載入失敗（API 可能不可用）:", err);
      }
    }

    async function loadSchedule() {
      try {
        const res = await fetch("/api/settings/schedule");
        if (!res.ok) return;
        const data = await res.json();
        if (data.error) return;

        if (data.configured) {
          setHasScheduleConfig(true);
          setCronExpression(data.cronExpression || "0 9 * * *");
          setTimezone(data.timezone || "Asia/Taipei");
          setScheduleEnabled(data.enabled ?? true);
          setNextRunAt(data.nextRunAt);
          setLastRunAt(data.lastRunAt);
        }
      } catch (err) {
        console.warn("排程載入失敗（API 可能不可用）:", err);
      }
    }

    loadSettings();
    loadSchedule();
  }, []);

  async function handleSaveAll() {
    setSaving(true);
    setSaveStatus(null);

    try {
      // Windsor API Key 一律存到 localStorage（前端讀取來源）
      if (windsorApiKey) {
        setApiKey(windsorApiKey);
      }

      // 嘗試 server-side 儲存（資料庫可能未連線，不阻擋流程）
      let serverSaveOk = true;
      try {
        const settingsRes = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            windsor: {
              apiKey: windsorApiKey || undefined,
              dateRange: windsorDateRange,
            },
            notion: {
              apiKey: notionApiKey || undefined,
              parentPageId: notionParentPageId || undefined,
              enabled: notionEnabled,
            },
            thresholds: thresholds,
          }),
        });

        if (!settingsRes.ok) {
          serverSaveOk = false;
        }

        const scheduleRes = await fetch("/api/settings/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cronExpression,
            timezone,
            enabled: scheduleEnabled,
          }),
        });

        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          setNextRunAt(scheduleData.schedule?.nextRunAt || null);
          setHasScheduleConfig(true);
        } else {
          serverSaveOk = false;
        }
      } catch {
        serverSaveOk = false;
      }

      if (!serverSaveOk) {
        console.warn(
          "Server-side 設定儲存失敗（資料庫可能未連線），Windsor API Key 已存至本地",
        );
      }

      setHasNotionConfig(true);
      setThresholdDirty(false);
      setSaveStatus(serverSaveOk ? "success" : "partial");

      setWindsorApiKey("");
      setNotionApiKey("");

      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error("儲存失敗:", error);
      setSaveStatus("fail");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  function updateThreshold(
    group: keyof AnalysisThresholds,
    key: string,
    value: number,
  ) {
    setThresholds((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
    setThresholdDirty(true);
  }

  function handleResetThresholds() {
    setThresholds(DEFAULT_THRESHOLDS);
    setThresholdDirty(true);
  }

  return (
    <>
      {/* 設定頁面 Header */}
      <header className="h-14 border-b border-card-border bg-card/80 backdrop-blur-sm flex items-center px-6 sticky top-0 z-30">
        <h1 className="text-sm font-semibold text-foreground">設定</h1>
      </header>

      <div className="flex-1 p-4 sm:p-6 max-w-2xl animate-fade-in">
        {/* Windsor API Key */}
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
                type={showWindsorKey ? "text" : "password"}
                value={windsorApiKey}
                onChange={(e) => setWindsorApiKey(e.target.value)}
                placeholder="貼上你的 Windsor API Key..."
                className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
              />
              <ToggleVisibility
                show={showWindsorKey}
                onToggle={() => setShowWindsorKey(!showWindsorKey)}
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              留空代表不變更現有設定
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">
              日期範圍
            </label>
            <select
              value={windsorDateRange}
              onChange={(e) => setWindsorDateRange(e.target.value)}
              className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
            >
              <option value="last_7d">過去 7 天</option>
              <option value="last_14d">過去 14 天</option>
              <option value="last_30d">過去 30 天</option>
            </select>
          </div>
        </SettingsSection>

        {/* Notion 自動同步設定 */}
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
          badge={
            hasNotionConfig ? (notionEnabled ? "已啟用" : "已停用") : undefined
          }
          badgeColor={
            notionEnabled ? "text-success bg-green-50" : "text-muted bg-gray-50"
          }
        >
          {/* 設定步驟說明 */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3.5 mb-4">
            <h4 className="text-xs font-semibold text-blue-800 mb-2">
              設定步驟
            </h4>
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
                type={showNotionKey ? "text" : "password"}
                value={notionApiKey}
                onChange={(e) => setNotionApiKey(e.target.value)}
                placeholder={
                  hasNotionConfig
                    ? "留空代表不變更..."
                    : "貼上 Notion Integration Token..."
                }
                className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent pr-10 transition-shadow"
              />
              <ToggleVisibility
                show={showNotionKey}
                onToggle={() => setShowNotionKey(!showNotionKey)}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="text-xs font-medium text-foreground mb-1.5 block">
              Notion Parent Page ID
            </label>
            <input
              type="text"
              value={notionParentPageId}
              onChange={(e) => setNotionParentPageId(e.target.value)}
              placeholder="貼上 Notion 頁面 ID（32 位字串）..."
              className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
            />
            <p className="text-[11px] text-muted mt-1">
              從 Notion 頁面 URL 中取得的 32 位字串
            </p>
          </div>

          <ToggleField
            label="啟用自動同步到 Notion"
            checked={notionEnabled}
            onChange={setNotionEnabled}
          />
        </SettingsSection>

        {/* 排程設定 */}
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
              onChange={(e) => setCronExpression(e.target.value)}
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
              onChange={(e) => setTimezone(e.target.value)}
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
            checked={scheduleEnabled}
            onChange={setScheduleEnabled}
          />

          {hasScheduleConfig && (
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

        {/* 分析閾值 */}
        <SettingsSection
          title="分析閾值設定"
          description="調整各分析模組的偵測門檻，修改後點擊儲存生效"
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
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
          }
          badge={thresholdDirty ? "未儲存" : undefined}
          badgeColor="text-amber-600 bg-amber-50"
        >
          <div className="space-y-4">
            <ThresholdGroup
              title="預算異常"
              items={[
                {
                  label: "CPC 暴漲",
                  value: thresholds.budget.cpcSpikePercent,
                  suffix: "%",
                  desc: "CPC 超過移動平均的百分比",
                  onChange: (v) =>
                    updateThreshold("budget", "cpcSpikePercent", v),
                },
                {
                  label: "CPM 暴漲",
                  value: thresholds.budget.cpmSpikePercent,
                  suffix: "%",
                  desc: "CPM 超過移動平均的百分比",
                  onChange: (v) =>
                    updateThreshold("budget", "cpmSpikePercent", v),
                },
              ]}
            />

            <ThresholdGroup
              title="成效下降"
              items={[
                {
                  label: "CTR 下降",
                  value: thresholds.performance.ctrDropPercent,
                  suffix: "%",
                  desc: "CTR 下降超過此百分比",
                  onChange: (v) =>
                    updateThreshold("performance", "ctrDropPercent", v),
                },
                {
                  label: "轉換率下降",
                  value: thresholds.performance.convRateDropPercent,
                  suffix: "%",
                  desc: "轉換率下降超過此百分比",
                  onChange: (v) =>
                    updateThreshold("performance", "convRateDropPercent", v),
                },
                {
                  label: "ROAS 下降",
                  value: thresholds.performance.roasDropPercent,
                  suffix: "%",
                  desc: "ROAS 下降超過此百分比",
                  onChange: (v) =>
                    updateThreshold("performance", "roasDropPercent", v),
                },
                {
                  label: "ROAS 虧損線",
                  value: thresholds.performance.roasMinThreshold,
                  suffix: "x",
                  desc: "ROAS 低於此值視為虧損",
                  step: 0.1,
                  onChange: (v) =>
                    updateThreshold("performance", "roasMinThreshold", v),
                },
              ]}
            />

            <ThresholdGroup
              title="素材疲勞"
              items={[
                {
                  label: "高頻率門檻",
                  value: thresholds.creative.highFrequency,
                  suffix: "",
                  desc: "頻率超過此值觸發警告",
                  step: 0.5,
                  onChange: (v) =>
                    updateThreshold("creative", "highFrequency", v),
                },
                {
                  label: "CTR 衰退",
                  value: thresholds.creative.ctrDeclinePercent,
                  suffix: "%",
                  desc: "素材 CTR 下降百分比",
                  onChange: (v) =>
                    updateThreshold("creative", "ctrDeclinePercent", v),
                },
                {
                  label: "觀察天數",
                  value: thresholds.creative.fatigueWindowDays,
                  suffix: " 天",
                  desc: "用於判斷趨勢的天數",
                  onChange: (v) =>
                    updateThreshold("creative", "fatigueWindowDays", v),
                },
              ]}
            />

            <ThresholdGroup
              title="擴量/停止建議"
              items={[
                {
                  label: "擴量門檻",
                  value: thresholds.recommendation.scaleRoasMin,
                  suffix: "x",
                  desc: "ROAS 達此值建議擴量",
                  step: 0.5,
                  onChange: (v) =>
                    updateThreshold("recommendation", "scaleRoasMin", v),
                },
                {
                  label: "停止門檻",
                  value: thresholds.recommendation.killRoasMax,
                  suffix: "x",
                  desc: "ROAS 低於此值建議停止",
                  step: 0.1,
                  onChange: (v) =>
                    updateThreshold("recommendation", "killRoasMax", v),
                },
                {
                  label: "最低花費",
                  value: thresholds.recommendation.minSpendForDecision,
                  suffix: "$",
                  desc: "低於此花費不給建議",
                  onChange: (v) =>
                    updateThreshold("recommendation", "minSpendForDecision", v),
                },
              ]}
            />
          </div>

          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-card-border">
            <button
              onClick={handleResetThresholds}
              className="px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors"
            >
              恢復預設值
            </button>
          </div>
        </SettingsSection>

        {/* 統一儲存按鈕 */}
        <div className="sticky bottom-4 sm:bottom-6 bg-card border border-card-border rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted">儲存所有設定</div>
            <div className="flex items-center gap-3">
              {saveStatus === "success" && (
                <span className="flex items-center gap-1.5 text-success text-sm font-medium animate-fade-in">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  已儲存
                </span>
              )}
              {saveStatus === "partial" && (
                <span className="flex items-center gap-1.5 text-warning text-sm font-medium animate-fade-in">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  本地設定已儲存，但伺服器同步失敗
                </span>
              )}
              {saveStatus === "fail" && (
                <span className="flex items-center gap-1.5 text-danger text-sm font-medium animate-fade-in">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  儲存失敗
                </span>
              )}
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-6 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm shadow-accent/20"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    儲存中
                  </span>
                ) : (
                  "儲存所有設定"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* === 子元件 === */

function SettingsSection({
  title,
  description,
  icon,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-card-border rounded-xl p-5 sm:p-6 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent-light text-accent flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {badge && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleVisibility({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
      title={show ? "隱藏" : "顯示"}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {show ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
          />
        ) : (
          <>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </>
        )}
      </svg>
    </button>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-accent transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
      </div>
      <span className="text-xs text-foreground group-hover:text-accent transition-colors">
        {label}
      </span>
    </label>
  );
}

interface ThresholdItem {
  label: string;
  value: number;
  suffix: string;
  desc: string;
  step?: number;
  onChange: (value: number) => void;
}

function ThresholdGroup({
  title,
  items,
}: {
  title: string;
  items: ThresholdItem[];
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100/80 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-foreground">{item.label}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={item.value}
                  step={item.step ?? 1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) item.onChange(v);
                  }}
                  className="w-16 text-right text-sm font-mono font-medium text-accent border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
                />
                {item.suffix && (
                  <span className="text-xs text-muted w-4">{item.suffix}</span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

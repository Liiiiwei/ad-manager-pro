"use client";

import { useState, useEffect } from "react";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";

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
  const [thresholds, setThresholds] = useState<AnalysisThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdDirty, setThresholdDirty] = useState(false);

  // UI 狀態
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"success" | "fail" | null>(null);

  useEffect(() => {
    loadSettings();
    loadSchedule();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();

      // Windsor 設定
      if (data.windsor) {
        setWindsorDateRange(data.windsor.dateRange || "last_7d");
        // API Key 是 masked，不需要顯示
      }

      // Notion 設定
      if (data.notion) {
        setHasNotionConfig(data.notion.configured);
        setNotionParentPageId(data.notion.parentPageId || "");
        setNotionEnabled(data.notion.enabled ?? true);
      }

      // 閾值設定
      if (data.thresholds) {
        setThresholds(data.thresholds);
      }
    } catch (error) {
      console.error("載入設定失敗:", error);
    }
  }

  async function loadSchedule() {
    try {
      const res = await fetch("/api/settings/schedule");
      const data = await res.json();

      if (data.configured) {
        setHasScheduleConfig(true);
        setCronExpression(data.cronExpression || "0 9 * * *");
        setTimezone(data.timezone || "Asia/Taipei");
        setScheduleEnabled(data.enabled ?? true);
        setNextRunAt(data.nextRunAt);
        setLastRunAt(data.lastRunAt);
      }
    } catch (error) {
      console.error("載入排程設定失敗:", error);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    setSaveStatus(null);

    try {
      // 1. 儲存基本設定（Windsor + Notion + 閾值）
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
        throw new Error("儲存設定失敗");
      }

      // 2. 儲存排程設定
      const scheduleRes = await fetch("/api/settings/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cronExpression,
          timezone,
          enabled: scheduleEnabled,
        }),
      });

      if (!scheduleRes.ok) {
        throw new Error("儲存排程失敗");
      }

      const scheduleData = await scheduleRes.json();

      // 更新狀態
      setHasNotionConfig(true);
      setHasScheduleConfig(true);
      setNextRunAt(scheduleData.schedule?.nextRunAt || null);
      setThresholdDirty(false);
      setSaveStatus("success");

      // 清空 API Key 輸入框（已儲存）
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
    <div className="flex-1 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-6">設定</h2>

      {/* Windsor API Key */}
      <section className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Windsor.ai API Key</h3>
        <p className="text-xs text-muted mb-4">
          輸入你的 Windsor.ai API Key 以連接廣告帳戶資料。
          可在{" "}
          <a
            href="https://onboard.windsor.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Windsor.ai 後台
          </a>
          {" "}取得。
        </p>

        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            API Key
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showWindsorKey ? "text" : "password"}
                value={windsorApiKey}
                onChange={(e) => setWindsorApiKey(e.target.value)}
                placeholder="貼上你的 Windsor API Key..."
                className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent pr-10"
              />
              <button
                type="button"
                onClick={() => setShowWindsorKey(!showWindsorKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                title={showWindsorKey ? "隱藏" : "顯示"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showWindsorKey ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-muted mt-1">留空代表不變更現有設定</p>
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            日期範圍
          </label>
          <select
            value={windsorDateRange}
            onChange={(e) => setWindsorDateRange(e.target.value)}
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="last_7d">過去 7 天</option>
            <option value="last_14d">過去 14 天</option>
            <option value="last_30d">過去 30 天</option>
          </select>
        </div>
      </section>

      {/* Notion 自動同步設定 */}
      <section className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Notion 自動同步設定</h3>
        <p className="text-xs text-muted mb-4">
          設定自動每日同步廣告報告到 Notion。系統會根據你設定的排程時間自動產生報告並建立 Notion 頁面。
        </p>

        {/* 設定步驟說明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-semibold text-blue-900 mb-2">📖 設定步驟</h4>
          <ol className="text-xs text-blue-800 space-y-2 pl-4 list-decimal">
            <li>
              前往 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">Notion Integrations</a>，建立 Integration 並複製 API Key
            </li>
            <li>
              在 Notion 建立一個頁面（例如：「廣告報告」），邀請剛才建立的 Integration，並複製頁面 URL 中的 Page ID（32 位字串）
            </li>
            <li>
              在下方輸入 API Key 和 Page ID，設定排程時間，點擊儲存即可啟用自動同步
            </li>
          </ol>
        </div>

        {/* Notion API Key 輸入 */}
        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            Notion API Key
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showNotionKey ? "text" : "password"}
                value={notionApiKey}
                onChange={(e) => setNotionApiKey(e.target.value)}
                placeholder={hasNotionConfig ? "留空代表不變更..." : "貼上你的 Notion Integration Token..."}
                className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNotionKey(!showNotionKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                title={showNotionKey ? "隱藏" : "顯示"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showNotionKey ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Notion Parent Page ID 輸入 */}
        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            Notion Parent Page ID
          </label>
          <input
            type="text"
            value={notionParentPageId}
            onChange={(e) => setNotionParentPageId(e.target.value)}
            placeholder="貼上 Notion 頁面 ID（32 位字串）..."
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="text-xs text-muted mt-1">
            從 Notion 頁面 URL 複製，例如：abc123def456...
          </p>
        </div>

        {/* 啟用/停用 Toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={notionEnabled}
              onChange={(e) => setNotionEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-xs text-foreground">啟用自動同步到 Notion</span>
          </label>
        </div>

        {/* 已設定提示 */}
        {hasNotionConfig && (
          <div className="mt-3 flex items-center gap-2 text-muted text-xs">
            <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            已設定 Notion 連結，自動同步{notionEnabled ? "已啟用" : "已停用"}
          </div>
        )}
      </section>

      {/* 排程設定 */}
      <section className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">自動同步排程</h3>
        <p className="text-xs text-muted mb-4">
          設定你的個人化排程時間。系統會在指定時間自動執行分析並同步到 Notion。
        </p>

        {/* Cron 表達式 */}
        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            Cron 排程表達式
          </label>
          <input
            type="text"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono"
          />
          <p className="text-xs text-muted mt-1">
            範例：<code className="bg-gray-100 px-1 rounded">0 9 * * *</code> = 每天 9:00，
            <code className="bg-gray-100 px-1 rounded mx-1">0 */6 * * *</code> = 每 6 小時
          </p>
        </div>

        {/* 時區選擇 */}
        <div className="mb-3">
          <label className="text-xs font-medium text-foreground mb-1.5 block">時區</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="UTC">UTC</option>
            <option value="Asia/Taipei">Asia/Taipei (台北)</option>
            <option value="Asia/Hong_Kong">Asia/Hong_Kong (香港)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (東京)</option>
            <option value="America/New_York">America/New_York (紐約)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (洛杉磯)</option>
          </select>
        </div>

        {/* 啟用/停用 */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-xs text-foreground">啟用自動排程</span>
          </label>
        </div>

        {/* 排程資訊 */}
        {hasScheduleConfig && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">上次執行時間</span>
              <span className="text-foreground font-mono">
                {lastRunAt ? new Date(lastRunAt).toLocaleString("zh-TW") : "尚未執行"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">下次執行時間</span>
              <span className="text-accent font-mono font-medium">
                {nextRunAt ? new Date(nextRunAt).toLocaleString("zh-TW") : "計算中..."}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 分析閾值 */}
      <section className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">分析閾值設定</h3>
          {thresholdDirty && (
            <span className="text-xs text-amber-600">有未儲存的變更</span>
          )}
        </div>
        <p className="text-xs text-muted mb-4">調整各分析模組的偵測門檻，修改後點擊儲存生效</p>

        <div className="space-y-4">
          <ThresholdGroup title="預算異常" items={[
            { label: "超支警告", value: thresholds.budget.overspendPercent, suffix: "%", desc: "日花費超過移動平均的百分比", onChange: (v) => updateThreshold("budget", "overspendPercent", v) },
            { label: "欠支警告", value: thresholds.budget.underspendPercent, suffix: "%", desc: "日花費低於移動平均的百分比", onChange: (v) => updateThreshold("budget", "underspendPercent", v) },
            { label: "CPC 暴漲", value: thresholds.budget.cpcSpikePercent, suffix: "%", desc: "CPC 超過移動平均的百分比", onChange: (v) => updateThreshold("budget", "cpcSpikePercent", v) },
            { label: "CPM 暴漲", value: thresholds.budget.cpmSpikePercent, suffix: "%", desc: "CPM 超過移動平均的百分比", onChange: (v) => updateThreshold("budget", "cpmSpikePercent", v) },
          ]} />

          <ThresholdGroup title="成效下降" items={[
            { label: "CTR 下降", value: thresholds.performance.ctrDropPercent, suffix: "%", desc: "CTR 下降超過此百分比", onChange: (v) => updateThreshold("performance", "ctrDropPercent", v) },
            { label: "轉換率下降", value: thresholds.performance.convRateDropPercent, suffix: "%", desc: "轉換率下降超過此百分比", onChange: (v) => updateThreshold("performance", "convRateDropPercent", v) },
            { label: "ROAS 下降", value: thresholds.performance.roasDropPercent, suffix: "%", desc: "ROAS 下降超過此百分比", onChange: (v) => updateThreshold("performance", "roasDropPercent", v) },
            { label: "ROAS 虧損線", value: thresholds.performance.roasMinThreshold, suffix: "x", desc: "ROAS 低於此值視為虧損", step: 0.1, onChange: (v) => updateThreshold("performance", "roasMinThreshold", v) },
          ]} />

          <ThresholdGroup title="素材疲勞" items={[
            { label: "高頻率門檻", value: thresholds.creative.highFrequency, suffix: "", desc: "頻率超過此值觸發警告", step: 0.5, onChange: (v) => updateThreshold("creative", "highFrequency", v) },
            { label: "CTR 衰退", value: thresholds.creative.ctrDeclinePercent, suffix: "%", desc: "素材 CTR 下降百分比", onChange: (v) => updateThreshold("creative", "ctrDeclinePercent", v) },
            { label: "觀察天數", value: thresholds.creative.fatigueWindowDays, suffix: " 天", desc: "用於判斷趨勢的天數", onChange: (v) => updateThreshold("creative", "fatigueWindowDays", v) },
          ]} />

          <ThresholdGroup title="擴量/停止建議" items={[
            { label: "擴量門檻", value: thresholds.recommendation.scaleRoasMin, suffix: "x", desc: "ROAS 達此值建議擴量", step: 0.5, onChange: (v) => updateThreshold("recommendation", "scaleRoasMin", v) },
            { label: "停止門檻", value: thresholds.recommendation.killRoasMax, suffix: "x", desc: "ROAS 低於此值建議停止", step: 0.1, onChange: (v) => updateThreshold("recommendation", "killRoasMax", v) },
            { label: "最低花費", value: thresholds.recommendation.minSpendForDecision, suffix: "$", desc: "低於此花費不給建議", onChange: (v) => updateThreshold("recommendation", "minSpendForDecision", v) },
          ]} />
        </div>

        {/* 重置按鈕 */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-card-border">
          <button
            onClick={handleResetThresholds}
            className="px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors"
          >
            恢復預設值
          </button>
        </div>
      </section>

      {/* 統一儲存按鈕 */}
      <div className="sticky bottom-6 bg-white border border-card-border rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            儲存所有設定（Windsor + Notion + 排程 + 閾值）
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-6 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? "儲存中..." : "儲存所有設定"}
            </button>
          </div>
        </div>

        {/* 儲存狀態 */}
        {saveStatus === "success" && (
          <div className="mt-3 flex items-center gap-2 text-success text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            所有設定已儲存成功！
          </div>
        )}
        {saveStatus === "fail" && (
          <div className="mt-3 flex items-center gap-2 text-danger text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            儲存失敗，請檢查設定是否正確
          </div>
        )}
      </div>
    </div>
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
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-3">
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
                  className="w-16 text-right text-sm font-mono font-medium text-accent border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                {item.suffix && (
                  <span className="text-xs text-muted">{item.suffix}</span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

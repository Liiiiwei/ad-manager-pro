"use client";

import { useState, useEffect } from "react";
import { getApiKey, setApiKey, clearApiKey } from "@/hooks/use-windsor-data";
import { DEFAULT_THRESHOLDS, getThresholds, saveThresholds } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";

export default function SettingsPage() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | null>(null);
  const [saving, setSaving] = useState(false);

  // Notion 設定 state
  const [notionKeyInput, setNotionKeyInput] = useState("");
  const [notionPageIdInput, setNotionPageIdInput] = useState("");
  const [notionEnabled, setNotionEnabled] = useState(true);
  const [hasNotionConfig, setHasNotionConfig] = useState(false);
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionSaveStatus, setNotionSaveStatus] = useState<"success" | "fail" | null>(null);

  // 閾值狀態
  const [thresholds, setThresholds] = useState<AnalysisThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdDirty, setThresholdDirty] = useState(false);

  useEffect(() => {
    const key = getApiKey();
    if (key) {
      setHasApiKey(true);
      setApiKeyInput(key);
    }

    // 從 API 載入 Notion 設定
    loadNotionSettings();

    setThresholds(getThresholds());
  }, []);

  async function loadNotionSettings() {
    try {
      const res = await fetch("/api/settings/notion");
      const data = await res.json();

      if (data.configured) {
        setHasNotionConfig(true);
        setNotionPageIdInput(data.parentPageId || "");
        setNotionEnabled(data.enabled ?? true);
        // API Key 不完整顯示，僅用於檢查是否已設定
      }
    } catch (error) {
      console.error("載入 Notion 設定失敗:", error);
    }
  }

  async function handleTest() {
    if (!apiKeyInput.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/windsor/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      setTestResult(data.valid ? "success" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    setApiKey(apiKeyInput.trim());
    setHasApiKey(true);
    setTimeout(() => setSaving(false), 500);
  }

  function handleClear() {
    clearApiKey();
    setApiKeyInput("");
    setHasApiKey(false);
    setTestResult(null);
  }

  // Notion 設定處理函式
  async function handleNotionSave() {
    if (!notionKeyInput.trim() || !notionPageIdInput.trim()) {
      setNotionSaveStatus("fail");
      setTimeout(() => setNotionSaveStatus(null), 3000);
      return;
    }

    setNotionSaving(true);
    setNotionSaveStatus(null);

    try {
      const res = await fetch("/api/settings/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: notionKeyInput.trim(),
          parentPageId: notionPageIdInput.trim(),
          enabled: notionEnabled,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setHasNotionConfig(true);
        setNotionSaveStatus("success");
        // 清空 API Key 輸入框（已儲存到伺服器）
        setNotionKeyInput("");
        setTimeout(() => setNotionSaveStatus(null), 3000);
      } else {
        setNotionSaveStatus("fail");
        setTimeout(() => setNotionSaveStatus(null), 3000);
      }
    } catch (error) {
      console.error("儲存 Notion 設定失敗:", error);
      setNotionSaveStatus("fail");
      setTimeout(() => setNotionSaveStatus(null), 3000);
    } finally {
      setNotionSaving(false);
    }
  }

  async function handleNotionClear() {
    try {
      await fetch("/api/settings/notion", { method: "DELETE" });
      setNotionKeyInput("");
      setNotionPageIdInput("");
      setNotionEnabled(true);
      setHasNotionConfig(false);
      setNotionSaveStatus(null);
    } catch (error) {
      console.error("清除 Notion 設定失敗:", error);
    }
  }

  // 更新閾值的 helper
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

  function handleSaveThresholds() {
    setThresholdSaving(true);
    saveThresholds(thresholds);
    setThresholdDirty(false);
    setTimeout(() => setThresholdSaving(false), 500);
  }

  function handleResetThresholds() {
    setThresholds(DEFAULT_THRESHOLDS);
    saveThresholds(DEFAULT_THRESHOLDS);
    setThresholdDirty(false);
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

        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setTestResult(null);
              }}
              placeholder="貼上你的 API Key..."
              className="w-full border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              title={showKey ? "隱藏" : "顯示"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showKey ? (
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

        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={!apiKeyInput.trim() || testing}
            className="px-4 py-2 text-sm bg-gray-100 text-foreground rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? "測試中..." : "測試連線"}
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKeyInput.trim() || saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "已儲存" : "儲存"}
          </button>
          {hasApiKey && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm text-danger hover:bg-red-50 rounded-lg transition-colors"
            >
              清除
            </button>
          )}
        </div>

        {/* 測試結果 */}
        {testResult === "success" && (
          <div className="mt-3 flex items-center gap-2 text-success text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            連線成功！API Key 有效
          </div>
        )}
        {testResult === "fail" && (
          <div className="mt-3 flex items-center gap-2 text-danger text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            連線失敗，請檢查 API Key 是否正確
          </div>
        )}
      </section>

      {/* Notion 自動同步設定 */}
      <section className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Notion 自動同步設定</h3>
        <p className="text-xs text-muted mb-4">
          設定自動每日同步廣告報告到 Notion。系統會在每天固定時間自動產生報告並建立 Notion 頁面。
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
              在下方輸入 API Key 和 Page ID，點擊儲存即可啟用自動同步
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
                value={notionKeyInput}
                onChange={(e) => {
                  setNotionKeyInput(e.target.value);
                  setNotionSaveStatus(null);
                }}
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
            value={notionPageIdInput}
            onChange={(e) => {
              setNotionPageIdInput(e.target.value);
              setNotionSaveStatus(null);
            }}
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
            <span className="text-xs text-foreground">啟用自動同步</span>
          </label>
        </div>

        {/* 儲存/清除按鈕 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleNotionSave}
            disabled={notionSaving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {notionSaving ? "儲存中..." : "儲存設定"}
          </button>
          {hasNotionConfig && (
            <button
              onClick={handleNotionClear}
              className="px-4 py-2 text-sm text-danger hover:bg-red-50 rounded-lg transition-colors"
            >
              清除設定
            </button>
          )}
        </div>

        {/* 儲存狀態顯示 */}
        {notionSaveStatus === "success" && (
          <div className="mt-3 flex items-center gap-2 text-success text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Notion 設定已儲存！自動同步將在下次排程時間執行
          </div>
        )}
        {notionSaveStatus === "fail" && (
          <div className="mt-3 flex items-center gap-2 text-danger text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            儲存失敗，請確認 API Key 和 Page ID 是否正確
          </div>
        )}

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

      {/* 分析閾值 */}
      <section className="bg-card border border-card-border rounded-xl p-6">
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

        {/* 儲存/重置按鈕 */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-card-border">
          <button
            onClick={handleSaveThresholds}
            disabled={!thresholdDirty || thresholdSaving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {thresholdSaving ? "已儲存" : "儲存閾值"}
          </button>
          <button
            onClick={handleResetThresholds}
            className="px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors"
          >
            恢復預設值
          </button>
        </div>
      </section>
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

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

  // Notion API Key state
  const [notionKeyInput, setNotionKeyInput] = useState("");
  const [hasNotionKey, setHasNotionKey] = useState(false);
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [notionSaving, setNotionSaving] = useState(false);

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

    // Load Notion API Key
    const notionKey = localStorage.getItem("notion_api_key");
    if (notionKey) {
      setHasNotionKey(true);
      setNotionKeyInput(notionKey);
    }

    setThresholds(getThresholds());
  }, []);

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

  // Notion API Key handlers
  function handleNotionSave() {
    if (!notionKeyInput.trim()) return;
    setNotionSaving(true);
    localStorage.setItem("notion_api_key", notionKeyInput.trim());
    setHasNotionKey(true);
    setTimeout(() => setNotionSaving(false), 500);
  }

  function handleNotionClear() {
    localStorage.removeItem("notion_api_key");
    setNotionKeyInput("");
    setHasNotionKey(false);
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

        {/* 環境變數設定說明 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-semibold text-amber-900 mb-2">⚙️ 環境變數設定（Zeabur）</h4>
          <p className="text-xs text-amber-800 mb-3">
            自動同步功能需要在 Zeabur Dashboard 設定以下環境變數：
          </p>
          <div className="space-y-2">
            <div className="bg-white rounded px-2 py-1.5">
              <code className="text-xs font-mono text-gray-800">WINDSOR_API_KEY</code>
              <span className="text-xs text-muted ml-2">= 你的 Windsor.ai API Key</span>
            </div>
            <div className="bg-white rounded px-2 py-1.5">
              <code className="text-xs font-mono text-gray-800">NOTION_API_KEY</code>
              <span className="text-xs text-muted ml-2">= Notion Integration Token</span>
            </div>
            <div className="bg-white rounded px-2 py-1.5">
              <code className="text-xs font-mono text-gray-800">NOTION_PARENT_PAGE_ID</code>
              <span className="text-xs text-muted ml-2">= 報告要建立在哪個頁面下</span>
            </div>
            <div className="bg-white rounded px-2 py-1.5">
              <code className="text-xs font-mono text-gray-800">CRON_SCHEDULE</code>
              <span className="text-xs text-muted ml-2">= 0 9 * * * （每天 9:00，選填）</span>
            </div>
            <div className="bg-white rounded px-2 py-1.5">
              <code className="text-xs font-mono text-gray-800">ENABLE_AUTO_SYNC</code>
              <span className="text-xs text-muted ml-2">= true（啟用自動同步，選填）</span>
            </div>
          </div>
        </div>

        {/* 設定步驟 */}
        <div className="mt-4 pt-4 border-t border-card-border">
          <h4 className="text-xs font-semibold text-foreground mb-2">📖 設定步驟</h4>
          <ol className="text-xs text-muted space-y-2 pl-4 list-decimal">
            <li>
              <strong>建立 Notion Integration</strong>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>前往 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Notion Integrations</a></li>
                <li>點擊 "New integration"，設定名稱（例如：Ad Manager Pro）</li>
                <li>複製 "Internal Integration Token" 作為 <code className="px-1 bg-gray-100 rounded">NOTION_API_KEY</code></li>
              </ul>
            </li>
            <li>
              <strong>建立 Notion Parent Page</strong>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>在 Notion 中建立一個新頁面（例如：「廣告報告」）</li>
                <li>點擊頁面右上角的 "Share" → "Invite"，邀請剛才建立的 Integration</li>
                <li>從頁面 URL 複製 Page ID（32 位字串）作為 <code className="px-1 bg-gray-100 rounded">NOTION_PARENT_PAGE_ID</code></li>
              </ul>
            </li>
            <li>
              <strong>在 Zeabur 設定環境變數</strong>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>登入 Zeabur Dashboard → 選擇專案 → 進入 "Variables" 設定</li>
                <li>新增上述所有環境變數</li>
                <li>儲存後重新部署應用</li>
              </ul>
            </li>
            <li>
              <strong>測試同步</strong>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>部署完成後，使用手動觸發 API 測試：<code className="px-1 bg-gray-100 rounded">POST /api/sync-notion</code></li>
                <li>檢查 Notion Parent Page 下是否成功建立新報告頁面</li>
                <li>查看 Zeabur Logs 確認 Cron Job 是否正常註冊</li>
              </ul>
            </li>
          </ol>
        </div>

        {/* 手動觸發區塊（僅供前端手動操作保留） */}
        <div className="mt-4 pt-4 border-t border-card-border">
          <h4 className="text-xs font-semibold text-foreground mb-2">🔧 前端手動操作（選用）</h4>
          <p className="text-xs text-muted mb-3">
            以下設定僅供在前端使用 Claude Code 手動產生報告時使用，與自動同步功能無關。
          </p>

          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <input
                type={showNotionKey ? "text" : "password"}
                value={notionKeyInput}
                onChange={(e) => setNotionKeyInput(e.target.value)}
                placeholder="貼上你的 Notion API Key（選用）..."
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

          <div className="flex items-center gap-2">
            <button
              onClick={handleNotionSave}
              disabled={!notionKeyInput.trim() || notionSaving}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {notionSaving ? "已儲存" : "儲存"}
            </button>
            {hasNotionKey && (
              <button
                onClick={handleNotionClear}
                className="px-4 py-2 text-sm text-danger hover:bg-red-50 rounded-lg transition-colors"
              >
                清除
              </button>
            )}
          </div>
        </div>
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

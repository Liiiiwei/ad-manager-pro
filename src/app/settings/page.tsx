"use client";

import { useState, useEffect } from "react";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis/thresholds";
import type { AnalysisThresholds } from "@/lib/analysis/types";
import { setApiKey } from "@/hooks/use-windsor-data";
import {
  WindsorSection,
  NotionSection,
  ScheduleSection,
  ThresholdSection,
} from "@/components/settings";

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

  // 載入設定
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

  // 統一儲存
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

  // 閾值更新
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
        <WindsorSection
          apiKey={windsorApiKey}
          onApiKeyChange={setWindsorApiKey}
          dateRange={windsorDateRange}
          onDateRangeChange={setWindsorDateRange}
          showKey={showWindsorKey}
          onToggleShowKey={() => setShowWindsorKey(!showWindsorKey)}
        />

        <NotionSection
          apiKey={notionApiKey}
          onApiKeyChange={setNotionApiKey}
          parentPageId={notionParentPageId}
          onParentPageIdChange={setNotionParentPageId}
          enabled={notionEnabled}
          onEnabledChange={setNotionEnabled}
          hasConfig={hasNotionConfig}
          showKey={showNotionKey}
          onToggleShowKey={() => setShowNotionKey(!showNotionKey)}
        />

        <ScheduleSection
          cronExpression={cronExpression}
          onCronExpressionChange={setCronExpression}
          timezone={timezone}
          onTimezoneChange={setTimezone}
          enabled={scheduleEnabled}
          onEnabledChange={setScheduleEnabled}
          hasConfig={hasScheduleConfig}
          nextRunAt={nextRunAt}
          lastRunAt={lastRunAt}
        />

        <ThresholdSection
          thresholds={thresholds}
          dirty={thresholdDirty}
          onUpdate={updateThreshold}
          onReset={handleResetThresholds}
        />

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

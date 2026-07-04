"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApiKey, useWindsorData } from "@/hooks/use-windsor-data";
import { useAccountBudgets } from "@/hooks/use-account-budgets";
import {
  buildDailySummary,
  deriveDigestDates,
} from "@/lib/digest/build-daily-summary";
import { pacingLevel, PACING_TEXT, PACING_BG } from "@/lib/initiatives/pacing";
import { formatCurrency, formatRoas } from "@/lib/utils/format";
import LoadingSpinner from "@/components/ui/loading-spinner";
import EmptyState from "@/components/ui/empty-state";

/** 今日異常通知（來自 /api/alerts/notifications） */
interface DailyNotification {
  id: string;
  title: string;
  message: string;
  severity: string;
  createdAt: string;
}

/** severity → 圓點顏色 token */
const SEVERITY_BG: Record<string, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export default function DailyPage() {
  const { hasApiKey, ready } = useApiKey();

  if (!ready) {
    return <LoadingSpinner message="載入設定中..." />;
  }

  if (!hasApiKey) {
    return (
      <EmptyState
        title="尚未設定 Windsor API Key"
        description="請先到設定頁儲存 Windsor API Key，才能載入每日摘要"
        actionLabel="前往設定"
        actionHref="/settings"
      />
    );
  }

  return <DailyContent />;
}

function DailyContent() {
  // 摘要用 60 天資料（涵蓋整月＋昨日），initiative 層級才有預算欄位
  const { data, loading, error, refetch } = useWindsorData(
    "last_60d",
    "all",
    "initiative",
  );
  const { budgets } = useAccountBudgets();

  // 今日異常通知（載入失敗靜默，不阻塞摘要）
  const [notifications, setNotifications] = useState<DailyNotification[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const res = await fetch("/api/alerts/notifications?limit=50");
        if (!res.ok) return;
        const json = await res.json();
        const list: DailyNotification[] = json.notifications ?? [];
        // 以台北時區的「今日 00:00」過濾
        const todayStr = new Date().toLocaleDateString("sv", {
          timeZone: "Asia/Taipei",
        });
        const startOfToday = new Date(`${todayStr}T00:00:00+08:00`);
        const todays = list.filter(
          (n) => new Date(n.createdAt) >= startOfToday,
        );
        if (!cancelled) setNotifications(todays);
      } catch {
        // 通知載入失敗不阻塞頁面
      }
    }
    loadNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (data.length === 0) return null;
    const now = new Date();
    return buildDailySummary(data, {
      manualBudgets: budgets,
      today: now,
      daysInMonth: deriveDigestDates(now).daysInMonth,
    });
  }, [data, budgets]);

  // ── loading 態 ──
  if (loading) {
    return <LoadingSpinner message="載入每日摘要中..." />;
  }

  // ── error 態 ──
  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-md mx-auto">
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 space-y-3">
          <p className="text-sm text-danger font-medium">載入失敗：{error}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  // ── empty 態 ──
  if (!summary) {
    return (
      <EmptyState
        title="尚無資料"
        description="Windsor 尚未回傳任何廣告資料，請稍後再試或檢查資料範圍"
      />
    );
  }

  // ── success 態 ──
  const progressPct =
    summary.monthProgress !== null ? summary.monthProgress * 100 : null;
  const level =
    summary.monthProgress !== null ? pacingLevel(summary.monthProgress) : null;

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto space-y-4 animate-fade-in">
      {/* 基準日 */}
      <p className="text-xs text-muted">資料基準日：{summary.date}</p>

      {/* 昨日花費 */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <p className="text-xs text-muted mb-1">昨日花費</p>
        <p className="text-3xl font-bold font-mono tabular-nums text-foreground">
          {formatCurrency(summary.yesterdaySpend)}
        </p>
      </div>

      {/* 本月配速 */}
      <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">本月配速</p>
          {level !== null && progressPct !== null ? (
            <span
              className={`text-sm font-semibold font-mono tabular-nums ${PACING_TEXT[level]}`}
            >
              {progressPct.toFixed(0)}%
            </span>
          ) : (
            <span className="text-sm text-muted">未設定預算</span>
          )}
        </div>
        {level !== null && progressPct !== null && (
          // 進度條：軌道用 card-border（globals.css 沒有 track token）
          <div className="h-2 rounded-full bg-card-border overflow-hidden">
            <div
              className={`h-full rounded-full ${PACING_BG[level]}`}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted">本月花費</p>
            <p className="font-mono tabular-nums text-foreground">
              {formatCurrency(summary.monthSpend)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">本月預算</p>
            <p className="font-mono tabular-nums text-foreground">
              {summary.monthBudget > 0
                ? formatCurrency(summary.monthBudget)
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 昨日 ROAS / CPA */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted mb-1">昨日 ROAS</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            {summary.yesterdayRoas !== null
              ? formatRoas(summary.yesterdayRoas)
              : "—"}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted mb-1">昨日 CPA</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">
            {summary.yesterdayCpa !== null
              ? formatCurrency(summary.yesterdayCpa)
              : "—"}
          </p>
        </div>
      </div>

      {/* 今日異常 */}
      <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
        <p className="text-xs text-muted">今日異常（{notifications.length}）</p>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted">今日沒有觸發任何異常規則</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    SEVERITY_BG[n.severity] ?? "bg-info"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {n.title}
                  </p>
                  <p className="text-xs text-muted break-words">{n.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 快速連結 */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/initiatives"
          className="bg-card border border-card-border rounded-xl p-4 text-center text-sm font-medium text-accent hover:bg-accent-light transition-colors"
        >
          預算配速
        </Link>
        <Link
          href="/alerts"
          className="bg-card border border-card-border rounded-xl p-4 text-center text-sm font-medium text-accent hover:bg-accent-light transition-colors"
        >
          異常規則
        </Link>
      </div>
    </div>
  );
}

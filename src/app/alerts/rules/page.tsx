"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/header";
import RuleForm from "@/components/alerts/rule-form";
import type {
  AlertRuleInput,
  MetricKey,
  RuleCondition,
} from "@/lib/alerts/types";
import { METRIC_LABELS, CONDITION_LABELS } from "@/lib/alerts/types";

interface AlertRule {
  id: string;
  name: string;
  metric: MetricKey;
  condition: RuleCondition;
  threshold: number;
  platform: "all" | "meta" | "google";
  campaignFilter?: string | null;
  enabled: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  all: "全平台",
  meta: "Meta",
  google: "Google",
};

export default function RulesPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/alerts/rules");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `載入失敗 (${res.status})`);
      }
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch (err) {
      console.error("載入規則失敗:", err);
      setError("載入規則失敗，請重新整理頁面");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleCreate(rule: AlertRuleInput) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) throw new Error("建立失敗");
      const { rule: created } = await res.json();
      setRules((prev) => [created, ...prev]);
      setShowForm(false);
    } catch (err) {
      console.error("建立規則失敗:", err);
      setError("建立規則失敗，請再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(rule: AlertRule) {
    setError(null);
    setTogglingId(rule.id);
    const { id, enabled } = rule;
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: !enabled }),
      });
      if (!res.ok) throw new Error("更新失敗");
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)),
      );
    } catch (err) {
      console.error("切換規則狀態失敗:", err);
      setError("切換規則狀態失敗，請再試一次");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(rule: AlertRule) {
    if (!confirm(`確定要刪除規則「${rule.name}」？`)) return;
    setError(null);
    setDeletingId(rule.id);
    try {
      const res = await fetch(`/api/alerts/rules?id=${rule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("刪除失敗");
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      console.error("刪除規則失敗:", err);
      setError("刪除規則失敗，請再試一次");
    } finally {
      setDeletingId(null);
    }
  }

  function buildDescription(rule: AlertRule) {
    const metricLabel = METRIC_LABELS[rule.metric] ?? rule.metric;
    const conditionLabel = CONDITION_LABELS[rule.condition] ?? rule.condition;
    const isChange = rule.condition.startsWith("change");
    const unit = isChange ? "%" : "";
    let desc = `當 ${metricLabel} ${conditionLabel} ${rule.threshold}${unit}`;
    if (rule.campaignFilter) {
      desc += `，Campaign 含「${rule.campaignFilter}」`;
    }
    return desc;
  }

  return (
    <>
      <Header title="提醒規則管理" />

      <div className="flex-1 p-4 sm:p-6 space-y-4 animate-fade-in">
        {/* 錯誤提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* 頂部操作列 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {loading ? "" : `共 ${rules.length} 條規則`}
          </p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 text-sm rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            {showForm ? "收起" : "+ 新增規則"}
          </button>
        </div>

        {/* 新增規則表單 */}
        {showForm && (
          <RuleForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        )}

        {/* 載入中 */}
        {loading && (
          <div className="text-sm text-muted text-center py-10">載入中...</div>
        )}

        {/* 空白狀態 */}
        {!loading && rules.length === 0 && !showForm && (
          <div className="bg-card border border-card-border rounded-xl p-10 text-center">
            <p className="text-foreground font-medium">尚未建立任何規則</p>
            <p className="text-muted text-sm mt-1">
              點擊「新增規則」開始設定提醒條件
            </p>
          </div>
        )}

        {/* 規則列表 */}
        {!loading && rules.length > 0 && (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="bg-card border border-card-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                {/* 規則資訊 */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {rule.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-muted font-medium">
                      {PLATFORM_LABELS[rule.platform] ?? rule.platform}
                    </span>
                    {!rule.enabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium border border-yellow-200">
                        已停用
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted">{buildDescription(rule)}</p>
                </div>

                {/* 操作按鈕 */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggle(rule)}
                    disabled={togglingId === rule.id}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                      rule.enabled
                        ? "border-card-border text-muted hover:text-foreground hover:bg-gray-50"
                        : "border-accent/30 text-accent hover:bg-accent/5"
                    }`}
                  >
                    {togglingId === rule.id
                      ? "處理中..."
                      : rule.enabled
                        ? "啟用中"
                        : "已停用"}
                  </button>
                  <button
                    onClick={() => handleDelete(rule)}
                    disabled={deletingId === rule.id}
                    className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deletingId === rule.id ? "刪除中..." : "刪除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

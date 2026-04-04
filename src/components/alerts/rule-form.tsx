"use client";

import { useState } from "react";
import type {
  AlertRuleInput,
  MetricKey,
  RuleCondition,
} from "@/lib/alerts/types";
import { METRIC_LABELS, CONDITION_LABELS } from "@/lib/alerts/types";

interface RuleFormProps {
  onSubmit: (rule: AlertRuleInput) => void;
  onCancel: () => void;
  initialValues?: Partial<AlertRuleInput>;
  submitting?: boolean;
}

export default function RuleForm({
  onSubmit,
  onCancel,
  initialValues,
  submitting = false,
}: RuleFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [metric, setMetric] = useState<MetricKey>(
    initialValues?.metric ?? "roas",
  );
  const [condition, setCondition] = useState<RuleCondition>(
    initialValues?.condition ?? "lt",
  );
  const [threshold, setThreshold] = useState<number>(
    initialValues?.threshold ?? 0,
  );
  const [platform, setPlatform] = useState<"all" | "meta" | "google">(
    initialValues?.platform ?? "all",
  );
  const [campaignFilter, setCampaignFilter] = useState(
    initialValues?.campaignFilter ?? "",
  );

  const isChangeCondition = condition.startsWith("change");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      metric,
      condition,
      threshold,
      platform,
      campaignFilter: campaignFilter.trim() || undefined,
    });
  }

  const inputClass =
    "w-full text-sm border border-card-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow text-foreground";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-card-border rounded-xl p-5 space-y-4"
    >
      {/* 規則名稱 */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">規則名稱</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：ROAS 跌幅警報"
          className={inputClass}
        />
      </div>

      {/* 監控指標 / 觸發條件 / 門檻值 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            監控指標
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className={inputClass}
          >
            {(Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => (
              <option key={key} value={key}>
                {METRIC_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            觸發條件
          </label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as RuleCondition)}
            className={inputClass}
          >
            {(Object.keys(CONDITION_LABELS) as RuleCondition[]).map((key) => (
              <option key={key} value={key}>
                {CONDITION_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            門檻值{isChangeCondition ? " (%)" : ""}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      {/* 平台 / Campaign 篩選 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">平台</label>
          <select
            value={platform}
            onChange={(e) =>
              setPlatform(e.target.value as "all" | "meta" | "google")
            }
            className={inputClass}
          >
            <option value="all">全平台</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            Campaign 篩選（選填）
          </label>
          <input
            type="text"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            placeholder="輸入關鍵字模糊匹配"
            className={inputClass}
          />
        </div>
      </div>

      {/* 按鈕列 */}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm rounded-lg border border-card-border text-muted hover:text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? "儲存中..." : "儲存規則"}
        </button>
      </div>
    </form>
  );
}

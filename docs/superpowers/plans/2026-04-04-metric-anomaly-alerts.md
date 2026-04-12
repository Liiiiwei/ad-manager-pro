# 數據異常變化指標提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者可以自訂監控規則，當廣告指標出現異常變化時，透過瀏覽器推播通知 + 應用內通知中心即時提醒。

**Architecture:** 在現有的 analysis engine 基礎上，新增 AlertRule（使用者自訂監控規則）和 AlertNotification（觸發記錄）兩個 Prisma model。新增 `/api/alerts/check` API 端點執行規則檢查，前端新增通知鈴鐺元件和規則管理頁面。使用 Web Notifications API 做瀏覽器推播。

**Tech Stack:** Next.js 16 + React 19 + Prisma 7 + Tailwind CSS 4 + Web Notifications API

---

## File Structure

```
prisma/schema.prisma                          — 新增 AlertRule, AlertNotification models
src/lib/alerts/rule-checker.ts                — 規則檢查引擎（比對資料與規則閾值）
src/lib/alerts/types.ts                       — AlertRule / AlertNotification 型別
src/app/api/alerts/rules/route.ts             — CRUD alert rules
src/app/api/alerts/check/route.ts             — 執行規則檢查，回傳觸發的通知
src/app/api/alerts/notifications/route.ts     — 取得/標記已讀通知
src/hooks/use-alert-notifications.ts          — 前端 hook：輪詢通知 + 瀏覽器推播
src/components/alerts/notification-bell.tsx   — Header 通知鈴鐺（含未讀數）
src/components/alerts/notification-panel.tsx  — 通知下拉面板
src/components/alerts/rule-form.tsx           — 新增/編輯規則表單
src/app/alerts/rules/page.tsx                 — 規則管理頁面
```

---

### Task 1: 新增 Prisma Models（AlertRule + AlertNotification）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 在 schema.prisma 新增 AlertRule model**

在 `SyncLog` model 之後、`enum SyncStatus` 之前加入：

```prisma
// ==================== 異常提醒規則表 ====================
model AlertRule {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  metric      String   // spend, roas, cpc, cpm, ctr, conversions, revenue
  condition   String   // gt (大於), lt (小於), change_gt (變化率大於), change_lt (變化率小於)
  threshold   Float
  platform    String   @default("all") // all, meta, google
  campaignFilter String? // 可選：僅監控特定 campaign（模糊匹配）
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  notifications AlertNotification[]

  @@index([userId])
  @@index([enabled])
}

// ==================== 異常提醒通知表 ====================
model AlertNotification {
  id          String   @id @default(cuid())
  ruleId      String
  rule        AlertRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  userId      String
  title       String
  message     String
  metric      String
  currentValue Float
  previousValue Float
  changePercent Float
  severity    String   // critical, warning, info
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([ruleId])
  @@index([read])
  @@index([createdAt])
}
```

- [ ] **Step 2: 在 User model 加入 relation**

在 User model 的 `syncLogs` 後面加入：

```prisma
  alertRules         AlertRule[]
  alertNotifications AlertNotification[]
```

- [ ] **Step 3: 執行 prisma generate**

Run: `npx prisma generate`
Expected: Prisma Client 成功產生，無錯誤

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: 新增 AlertRule 和 AlertNotification Prisma models"
```

---

### Task 2: 定義型別和規則檢查引擎

**Files:**
- Create: `src/lib/alerts/types.ts`
- Create: `src/lib/alerts/rule-checker.ts`

- [ ] **Step 1: 建立 types.ts**

```typescript
export interface AlertRuleInput {
  name: string;
  metric: MetricKey;
  condition: RuleCondition;
  threshold: number;
  platform: "all" | "meta" | "google";
  campaignFilter?: string;
  enabled?: boolean;
}

export type MetricKey =
  | "spend"
  | "roas"
  | "cpc"
  | "cpm"
  | "ctr"
  | "conversions"
  | "revenue";

export type RuleCondition =
  | "gt"       // 絕對值大於
  | "lt"       // 絕對值小於
  | "change_gt" // 變化率大於 (%)
  | "change_lt"; // 變化率小於 (%)

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  title: string;
  message: string;
  metric: MetricKey;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  severity: "critical" | "warning" | "info";
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "花費",
  roas: "ROAS",
  cpc: "CPC",
  cpm: "CPM",
  ctr: "CTR",
  conversions: "轉換數",
  revenue: "營收",
};

export const CONDITION_LABELS: Record<RuleCondition, string> = {
  gt: "大於",
  lt: "小於",
  change_gt: "漲幅超過 (%)",
  change_lt: "跌幅超過 (%)",
};
```

- [ ] **Step 2: 建立 rule-checker.ts**

```typescript
import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { TriggeredAlert, MetricKey, RuleCondition } from "./types";
import { average, percentChange } from "@/lib/utils/math";

interface RuleRow {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  platform: string;
  campaignFilter: string | null;
}

/**
 * 檢查一組規則是否被觸發
 * 策略：將資料依日期排序，比較最近一天 vs 前 7 天平均
 */
export function checkRules(
  rules: RuleRow[],
  data: WindsorAdRecord[],
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    // 依平台過濾
    let filtered = data;
    if (rule.platform === "meta") {
      filtered = data.filter(
        (r) => r.source.includes("facebook") || r.source.includes("instagram"),
      );
    } else if (rule.platform === "google") {
      filtered = data.filter((r) => r.source.includes("google"));
    }

    // 依 campaign 過濾（模糊匹配）
    if (rule.campaignFilter) {
      const keyword = rule.campaignFilter.toLowerCase();
      filtered = filtered.filter(
        (r) => r.campaign.toLowerCase().includes(keyword),
      );
    }

    if (filtered.length < 2) continue;

    // 依日期排序
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // 取得所有日期
    const dates = [...new Set(sorted.map((r) => r.date))].sort();
    if (dates.length < 2) continue;

    const latestDate = dates[dates.length - 1];
    const previousDates = dates.slice(0, -1).slice(-7);

    const latestRecords = sorted.filter((r) => r.date === latestDate);
    const previousRecords = sorted.filter((r) =>
      previousDates.includes(r.date),
    );

    const metric = rule.metric as MetricKey;
    const currentValue = aggregateMetric(latestRecords, metric);
    const previousValue = aggregateMetric(previousRecords, metric);
    const change = percentChange(currentValue, previousValue);
    const condition = rule.condition as RuleCondition;

    const isTriggered = evaluateCondition(
      condition,
      rule.threshold,
      currentValue,
      change,
    );

    if (isTriggered) {
      triggered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        title: buildTitle(rule.name, metric, condition, currentValue),
        message: buildMessage(metric, condition, currentValue, previousValue, change),
        metric,
        currentValue,
        previousValue,
        changePercent: change,
        severity: determineSeverity(condition, rule.threshold, currentValue, change),
      });
    }
  }

  return triggered;
}

function aggregateMetric(records: WindsorAdRecord[], metric: MetricKey): number {
  if (records.length === 0) return 0;
  switch (metric) {
    case "spend":
      return records.reduce((s, r) => s + r.spend, 0);
    case "revenue":
      return records.reduce((s, r) => s + r.revenue, 0);
    case "conversions":
      return records.reduce((s, r) => s + r.conversions, 0);
    case "roas": {
      const spend = records.reduce((s, r) => s + r.spend, 0);
      const revenue = records.reduce((s, r) => s + r.revenue, 0);
      return spend > 0 ? revenue / spend : 0;
    }
    case "cpc":
      return average(records.map((r) => r.cpc));
    case "cpm":
      return average(records.map((r) => r.cpm));
    case "ctr":
      return average(records.map((r) => r.ctr));
  }
}

function evaluateCondition(
  condition: RuleCondition,
  threshold: number,
  currentValue: number,
  changePercent: number,
): boolean {
  switch (condition) {
    case "gt":
      return currentValue > threshold;
    case "lt":
      return currentValue < threshold;
    case "change_gt":
      return changePercent > threshold;
    case "change_lt":
      return changePercent < -threshold;
  }
}

function determineSeverity(
  condition: RuleCondition,
  threshold: number,
  currentValue: number,
  changePercent: number,
): "critical" | "warning" | "info" {
  const absChange = Math.abs(changePercent);
  if (condition === "change_gt" || condition === "change_lt") {
    if (absChange > threshold * 2) return "critical";
    if (absChange > threshold * 1.5) return "warning";
    return "info";
  }
  // 絕對值條件：超過閾值 50% 以上為 critical
  if (condition === "gt" && currentValue > threshold * 1.5) return "critical";
  if (condition === "lt" && currentValue < threshold * 0.5) return "critical";
  return "warning";
}

function buildTitle(
  ruleName: string,
  metric: MetricKey,
  condition: RuleCondition,
  currentValue: number,
): string {
  const metricLabels: Record<MetricKey, string> = {
    spend: "花費", roas: "ROAS", cpc: "CPC", cpm: "CPM",
    ctr: "CTR", conversions: "轉換數", revenue: "營收",
  };
  return `${ruleName}：${metricLabels[metric]} 異常`;
}

function buildMessage(
  metric: MetricKey,
  condition: RuleCondition,
  currentValue: number,
  previousValue: number,
  changePercent: number,
): string {
  const fmt = (v: number) => v.toFixed(2);
  const metricLabels: Record<MetricKey, string> = {
    spend: "花費", roas: "ROAS", cpc: "CPC", cpm: "CPM",
    ctr: "CTR", conversions: "轉換數", revenue: "營收",
  };
  const label = metricLabels[metric];

  if (condition === "change_gt" || condition === "change_lt") {
    const dir = changePercent > 0 ? "上升" : "下降";
    return `${label}從 ${fmt(previousValue)} ${dir}至 ${fmt(currentValue)}，變化 ${changePercent.toFixed(1)}%`;
  }
  return `${label}目前值 ${fmt(currentValue)}，已觸發規則門檻`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/alerts/types.ts src/lib/alerts/rule-checker.ts
git commit -m "feat: 新增異常提醒規則型別與檢查引擎"
```

---

### Task 3: 建立 Alert Rules CRUD API

**Files:**
- Create: `src/app/api/alerts/rules/route.ts`

- [ ] **Step 1: 建立 rules API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUserId } from "@/lib/auth/clerk";
import type { AlertRuleInput } from "@/lib/alerts/types";

// 取得使用者的所有規則
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const rules = await prisma.alertRule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ rules });
}

// 建立新規則
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const body: AlertRuleInput = await request.json();

  const rule = await prisma.alertRule.create({
    data: {
      userId,
      name: body.name,
      metric: body.metric,
      condition: body.condition,
      threshold: body.threshold,
      platform: body.platform || "all",
      campaignFilter: body.campaignFilter || null,
      enabled: body.enabled ?? true,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}

// 更新規則（用 PATCH body 帶 id）
export async function PATCH(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  const rule = await prisma.alertRule.updateMany({
    where: { id, userId },
    data: updates,
  });

  if (rule.count === 0) {
    return NextResponse.json({ error: "規則不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// 刪除規則
export async function DELETE(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少規則 ID" }, { status: 400 });
  }

  const result = await prisma.alertRule.deleteMany({
    where: { id, userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "規則不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/alerts/rules/route.ts
git commit -m "feat: 新增 Alert Rules CRUD API"
```

---

### Task 4: 建立規則檢查 API + 通知 API

**Files:**
- Create: `src/app/api/alerts/check/route.ts`
- Create: `src/app/api/alerts/notifications/route.ts`

- [ ] **Step 1: 建立 check API（執行規則檢查並寫入通知）**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUserId } from "@/lib/auth/clerk";
import { fetchWindsor } from "@/lib/windsor/client";
import { buildAdPerformanceQuery } from "@/lib/windsor/queries";
import { checkRules } from "@/lib/alerts/rule-checker";

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const apiKey = request.headers.get("x-windsor-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "缺少 Windsor API Key" }, { status: 401 });
  }

  // 取得啟用中的規則
  const rules = await prisma.alertRule.findMany({
    where: { userId, enabled: true },
  });

  if (rules.length === 0) {
    return NextResponse.json({ triggered: [], message: "沒有啟用的規則" });
  }

  // 拉取最近 14 天資料（需要足夠的歷史資料做比較）
  const query = buildAdPerformanceQuery("all", "last_14d");
  const response = await fetchWindsor(apiKey, query);

  // 執行規則檢查
  const triggered = checkRules(rules, response.data);

  // 寫入通知（避免重複：同一規則今天只觸發一次）
  const today = new Date().toISOString().slice(0, 10);
  const newNotifications = [];

  for (const alert of triggered) {
    // 檢查今天是否已有同一規則的通知
    const existing = await prisma.alertNotification.findFirst({
      where: {
        ruleId: alert.ruleId,
        userId,
        createdAt: {
          gte: new Date(`${today}T00:00:00Z`),
        },
      },
    });

    if (!existing) {
      const notification = await prisma.alertNotification.create({
        data: {
          ruleId: alert.ruleId,
          userId,
          title: alert.title,
          message: alert.message,
          metric: alert.metric,
          currentValue: alert.currentValue,
          previousValue: alert.previousValue,
          changePercent: alert.changePercent,
          severity: alert.severity,
        },
      });
      newNotifications.push(notification);
    }
  }

  return NextResponse.json({
    triggered: newNotifications,
    checkedRules: rules.length,
  });
}
```

- [ ] **Step 2: 建立 notifications API（取得通知 + 標記已讀）**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUserId } from "@/lib/auth/clerk";

// 取得通知列表
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const notifications = await prisma.alertNotification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      rule: { select: { name: true, metric: true } },
    },
  });

  const unreadCount = await prisma.alertNotification.count({
    where: { userId, read: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

// 標記已讀
export async function PATCH(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const body = await request.json();

  if (body.markAllRead) {
    await prisma.alertNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  } else if (body.id) {
    await prisma.alertNotification.updateMany({
      where: { id: body.id, userId },
      data: { read: true },
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/alerts/check/route.ts src/app/api/alerts/notifications/route.ts
git commit -m "feat: 新增規則檢查 API 和通知 API"
```

---

### Task 5: 建立前端通知 Hook

**Files:**
- Create: `src/hooks/use-alert-notifications.ts`

- [ ] **Step 1: 建立 hook（輪詢通知 + 瀏覽器推播）**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiKey } from "@/hooks/use-windsor-data";

interface Notification {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  severity: string;
  read: boolean;
  createdAt: string;
  rule: { name: string; metric: string };
}

// 請求瀏覽器通知權限
function requestNotificationPermission() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// 發送瀏覽器通知
function sendBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.ico" });
}

export function useAlertNotifications(pollIntervalMs = 5 * 60 * 1000) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const previousUnreadRef = useRef(0);

  // 啟動時請求通知權限
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // 取得通知列表
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/notifications?limit=50");
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.notifications);
      setUnreadCount(json.unreadCount);

      // 有新的未讀通知時推送瀏覽器通知
      if (json.unreadCount > previousUnreadRef.current) {
        const newest = json.notifications.find((n: Notification) => !n.read);
        if (newest) {
          sendBrowserNotification(newest.title, newest.message);
        }
      }
      previousUnreadRef.current = json.unreadCount;
    } finally {
      setLoading(false);
    }
  }, []);

  // 觸發規則檢查
  const triggerCheck = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    await fetch("/api/alerts/check", {
      method: "POST",
      headers: { "x-windsor-api-key": apiKey },
    });
    // 檢查完後重新取得通知
    await fetchNotifications();
  }, [fetchNotifications]);

  // 標記已讀
  const markAsRead = useCallback(async (id: string) => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // 全部標記已讀
  const markAllRead = useCallback(async () => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  // 初次載入 + 定時輪詢
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      triggerCheck();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchNotifications, triggerCheck, pollIntervalMs]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
    triggerCheck,
    refetch: fetchNotifications,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-alert-notifications.ts
git commit -m "feat: 新增通知輪詢 hook 與瀏覽器推播"
```

---

### Task 6: 建立通知鈴鐺 + 通知面板元件

**Files:**
- Create: `src/components/alerts/notification-bell.tsx`
- Create: `src/components/alerts/notification-panel.tsx`

- [ ] **Step 1: 建立 notification-panel.tsx（通知下拉面板）**

```tsx
"use client";

import { formatPercent } from "@/lib/utils/format";

interface Notification {
  id: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  createdAt: string;
}

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllRead,
  onClose,
}: NotificationPanelProps) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-card-border rounded-xl shadow-lg z-50 max-h-[70vh] flex flex-col">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="text-sm font-semibold text-foreground">通知</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="text-xs text-accent hover:underline"
          >
            全部已讀
          </button>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 通知列表 */}
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">沒有通知</p>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => onMarkAsRead(n.id)}
              className={`w-full text-left px-4 py-3 border-b border-card-border last:border-b-0 hover:bg-gray-50 transition-colors ${
                n.read ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    severityDot[n.severity] || "bg-gray-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {n.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {new Date(n.createdAt).toLocaleString("zh-TW")}
                  </p>
                </div>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 建立 notification-bell.tsx（通知鈴鐺）**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useAlertNotifications } from "@/hooks/use-alert-notifications";
import NotificationPanel from "./notification-panel";

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllRead,
  } = useAlertNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="通知"
      >
        <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          notifications={notifications}
          onMarkAsRead={markAsRead}
          onMarkAllRead={markAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts/notification-bell.tsx src/components/alerts/notification-panel.tsx
git commit -m "feat: 新增通知鈴鐺和通知下拉面板元件"
```

---

### Task 7: 將通知鈴鐺整合到 Header

**Files:**
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: 讀取現有 header.tsx 內容**

Run: 讀取 `src/components/layout/header.tsx` 檔案

- [ ] **Step 2: 在 Header 右側加入 NotificationBell**

在 Header 元件的右側區域（日期範圍 / 平台篩選器旁邊）加入：

```tsx
import NotificationBell from "@/components/alerts/notification-bell";
```

然後在 Header JSX 的右側區域加入 `<NotificationBell />`，放在現有按鈕群組的最左邊。

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/header.tsx
git commit -m "feat: 在 Header 整合通知鈴鐺"
```

---

### Task 8: 建立規則管理頁面

**Files:**
- Create: `src/components/alerts/rule-form.tsx`
- Create: `src/app/alerts/rules/page.tsx`

- [ ] **Step 1: 建立 rule-form.tsx（規則表單元件）**

```tsx
"use client";

import { useState } from "react";
import type { AlertRuleInput, MetricKey, RuleCondition } from "@/lib/alerts/types";
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
  submitting,
}: RuleFormProps) {
  const [name, setName] = useState(initialValues?.name || "");
  const [metric, setMetric] = useState<MetricKey>(initialValues?.metric || "roas");
  const [condition, setCondition] = useState<RuleCondition>(initialValues?.condition || "change_lt");
  const [threshold, setThreshold] = useState(initialValues?.threshold ?? 30);
  const [platform, setPlatform] = useState<"all" | "meta" | "google">(initialValues?.platform || "all");
  const [campaignFilter, setCampaignFilter] = useState(initialValues?.campaignFilter || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      metric,
      condition,
      threshold,
      platform,
      campaignFilter: campaignFilter || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
      {/* 規則名稱 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">規則名稱</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：ROAS 跌幅警報"
          required
          className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* 指標 + 條件 + 閾值 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">監控指標</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">觸發條件</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as RuleCondition)}
            className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {Object.entries(CONDITION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            門檻值{condition.startsWith("change") ? " (%)" : ""}
          </label>
          <input
            type="number"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
            required
            className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* 平台 + Campaign 過濾 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">平台</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as "all" | "meta" | "google")}
            className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">全平台</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Campaign 篩選（選填）</label>
          <input
            type="text"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            placeholder="輸入關鍵字模糊匹配"
            className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* 按鈕 */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-card-border rounded-lg text-muted hover:text-foreground transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !name}
          className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {submitting ? "儲存中..." : "儲存規則"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: 建立 rules/page.tsx（規則管理頁面）**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/header";
import RuleForm from "@/components/alerts/rule-form";
import type { AlertRuleInput, MetricKey, RuleCondition } from "@/lib/alerts/types";
import { METRIC_LABELS, CONDITION_LABELS } from "@/lib/alerts/types";

interface Rule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  platform: string;
  campaignFilter: string | null;
  enabled: boolean;
  createdAt: string;
}

export default function AlertRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/rules");
      if (res.ok) {
        const json = await res.json();
        setRules(json.rules);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleCreate(input: AlertRuleInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        setShowForm(false);
        fetchRules();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch("/api/alerts/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    fetchRules();
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個規則嗎？")) return;
    await fetch(`/api/alerts/rules?id=${id}`, { method: "DELETE" });
    fetchRules();
  }

  const platformLabels: Record<string, string> = {
    all: "全平台",
    meta: "Meta",
    google: "Google",
  };

  return (
    <>
      <Header title="提醒規則管理" />
      <div className="flex-1 p-4 sm:p-6 space-y-4 animate-fade-in">
        {/* 新增按鈕 */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted">
            設定自訂監控規則，當指標異常時自動提醒你
          </p>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showForm ? "收起" : "新增規則"}
          </button>
        </div>

        {/* 新增表單 */}
        {showForm && (
          <RuleForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        )}

        {/* 規則列表 */}
        {loading ? (
          <p className="text-sm text-muted text-center py-8">載入中...</p>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 bg-card border border-card-border rounded-xl">
            <p className="text-sm text-muted">尚未建立任何提醒規則</p>
            <p className="text-xs text-muted mt-1">點擊「新增規則」開始設定</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-card border border-card-border rounded-xl p-4 flex items-center justify-between ${
                  !rule.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground">{rule.name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-muted">
                      {platformLabels[rule.platform] || rule.platform}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    當 {METRIC_LABELS[rule.metric as MetricKey] || rule.metric}{" "}
                    {CONDITION_LABELS[rule.condition as RuleCondition] || rule.condition}{" "}
                    {rule.threshold}
                    {rule.condition.startsWith("change") ? "%" : ""}
                    {rule.campaignFilter ? ` (Campaign 含「${rule.campaignFilter}」)` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => handleToggle(rule.id, rule.enabled)}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      rule.enabled
                        ? "bg-green-50 border-green-200 text-green-700"
                        : "bg-gray-50 border-gray-200 text-muted"
                    }`}
                  >
                    {rule.enabled ? "啟用中" : "已停用"}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="px-3 py-1 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    刪除
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
```

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts/rule-form.tsx src/app/alerts/rules/page.tsx
git commit -m "feat: 新增規則管理頁面與規則表單元件"
```

---

### Task 9: 在 Sidebar 加入規則管理入口

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: 讀取現有 sidebar.tsx 內容**

Run: 讀取 `src/components/layout/sidebar.tsx` 檔案

- [ ] **Step 2: 在警示中心下方新增「提醒規則」連結**

在 sidebar 的導航項目中，於「警示中心」(`/alerts`) 項目後新增：

```tsx
{ href: "/alerts/rules", label: "提醒規則", icon: /* 鈴鐺 + 齒輪 icon */ }
```

使用與其他項目一致的樣式和 icon 風格。

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: 在 Sidebar 新增提醒規則入口"
```

---

### Task 10: 資料庫遷移 + 整合測試

**Files:**
- 無新建檔案

- [ ] **Step 1: 執行 prisma db push**

Run: `npx prisma db push --skip-generate`
Expected: 成功建立 AlertRule 和 AlertNotification 表

- [ ] **Step 2: 啟動 dev server 驗證**

Run: `npm run dev`
驗證項目：
1. 開啟 `/alerts/rules` 頁面，能看到「新增規則」按鈕
2. 建立一個規則（例如：ROAS 跌幅超過 30%），確認成功儲存
3. Header 右上角出現通知鈴鐺
4. 點擊鈴鐺展開通知面板

- [ ] **Step 3: Commit 所有未提交的改動**

```bash
git add -A
git commit -m "feat: 完成數據異常指標提醒功能整合"
```

---

## 功能摘要

| 功能 | 說明 |
|------|------|
| 自訂規則 | 使用者可建立多條監控規則，選擇指標、條件、門檻值 |
| 平台篩選 | 可針對 Meta / Google / 全平台設定不同規則 |
| Campaign 篩選 | 可限定特定 campaign（模糊匹配） |
| 自動檢查 | 前端每 5 分鐘輪詢執行規則檢查 |
| 去重機制 | 同一規則每天最多觸發一次通知 |
| 瀏覽器推播 | 有新通知時發送 Web Notification |
| 通知中心 | Header 鈴鐺 + 下拉面板顯示歷史通知 |
| 已讀管理 | 單條已讀 / 全部已讀 |
| 規則管理 | 啟用/停用/刪除規則 |

# UIUX Workflow Priorities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Ad Manager Pro 的第一、二階段 UI/UX 優化落地，讓使用者先看到今日優先處理事項，再進入活動列表與警示佇列。

**Architecture:** 保留現有資料 hooks 與分析引擎，不新增後端資料模型。第一階段統一篩選入口、移除活動表內重複平台篩選，並在儀表板上方新增今日優先處理區塊。第二階段把警示中心整理成待辦佇列樣式，沿用目前本機解決狀態，但改善篩選、排序與卡片資訊層級。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、現有 `useWindsorData` / `useAnalysis` hooks。

**Spec:** 使用者要求「做第一二階段 寫計劃後執行」；第一階段為統一篩選列、活動表雙重平台篩選修正、首頁新增今日待辦；第二階段為警示中心改成待辦佇列，加入處理狀態與影響排序。

## Global Constraints

- 全程使用繁體中文 UI 文案。
- 不碰既有廣告架構相關未提交變更。
- 新 UI 遵守 `DESIGN.md`：使用 token 類別、數字加 `font-mono tabular-nums`、語意色一致。
- UI 需保留 loading、error、empty、success 四態。
- async 操作時按鈕需 disabled。
- 不新增外部套件。

---

### Task 1: 統一活動表篩選與掃描資訊

**Files:**
- Modify: `src/app/campaigns/page.tsx`
- Modify: `src/components/campaigns/campaign-table.tsx`

**Interfaces:**
- Consumes: `Header` 的 `platform` 篩選結果已透過 `useWindsorData(dateRange, platform)` 套用。
- Produces: `CampaignTable({ data }: { data: WindsorAdRecord[] })`，表格內不再維護第二組平台篩選。

- [ ] **Step 1: 移除活動表內平台狀態**

刪除 `platformFilter` state 與篩選列內平台按鈕，只保留活動數量與新增搜尋框。

- [ ] **Step 2: 新增活動搜尋**

在 `CampaignTable` 新增 `searchQuery` state，針對 `campaign` 與 `platform` 做不分大小寫搜尋。

- [ ] **Step 3: 加強表格掃描**

讓活動名稱欄位 `max-w`、`truncate`，數字欄位使用 `font-mono tabular-nums whitespace-nowrap`，ROAS 欄位維持語意色。

- [ ] **Step 4: 驗證**

Run: `npm run lint`
Expected: lint 通過，活動表不再出現第二組平台篩選。

### Task 2: 儀表板新增今日優先處理事項

**Files:**
- Create: `src/components/dashboard/priority-workbench.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `alerts: Alert[]`、`summary?: AnalysisResult["summary"]`、`data: WindsorAdRecord[]`。
- Produces: `PriorityWorkbench` 元件，顯示嚴重警示、警告、低 ROAS 活動、花費最高活動四個判斷入口。

- [ ] **Step 1: 建立 PriorityWorkbench**

建立 client-safe 純展示元件，計算：
- 嚴重警示數：`severity === "critical"`
- 警告數：`severity === "warning"`
- 低 ROAS 活動數：活動層級彙總後 `spend > 0 && roas < 1`
- 花費最高活動：活動層級彙總後依 `spend` 排序第一名

- [ ] **Step 2: 設計資訊層級**

區塊標題為「今日優先處理」，右側顯示「依目前篩選」。四張緊湊卡片需有狀態文案、數字、輔助說明與前往連結。

- [ ] **Step 3: 放入儀表板首屏**

在 KPI 卡片前放入 `PriorityWorkbench`，使用已套帳號篩選的 `filteredData` 與 `result?.alerts`。

- [ ] **Step 4: 驗證**

Run: `npm run lint`
Expected: lint 通過，首頁 loading/error/empty/success 流程不受影響。

### Task 3: 警示中心改成待辦佇列

**Files:**
- Modify: `src/components/alerts/alert-list.tsx`
- Modify: `src/components/alerts/alert-card.tsx`

**Interfaces:**
- Consumes: `Alert[]` 與目前 `resolved_alerts` localStorage。
- Produces: 預設顯示未處理警示，排序為嚴重度優先、變化幅度次之；提供「未處理 / 已處理」切換。

- [ ] **Step 1: 重構篩選列為工作佇列表頭**

新增摘要列：未處理數、嚴重數、警告數、已處理數。分類與嚴重度篩選保留，但改成較緊湊的 segmented controls。

- [ ] **Step 2: 加入排序規則**

未處理列表依 `critical > warning > info` 排序，再依 `Math.abs(changePercent)` 由大到小排序。

- [ ] **Step 3: 強化 AlertCard 資訊架構**

卡片顯示帳號 / 活動名稱、指標變化、偵測日期與建議行動。按鈕文案改為「標記完成」與「恢復未處理」，並保留 disabled-ready 的按鈕樣式基礎。

- [ ] **Step 4: 改善空狀態**

未處理空狀態顯示「目前沒有待處理警示」；已處理空狀態顯示「尚無已處理警示」；篩選無結果顯示「沒有符合篩選條件的警示」。

- [ ] **Step 5: 驗證**

Run: `npm run lint`
Expected: lint 通過，警示中心可篩選、切換已處理、標記完成。

### Task 4: 最終驗證

**Files:**
- No source changes.

**Interfaces:**
- Consumes: Task 1-3 的完成狀態。
- Produces: 可交付結果與驗證紀錄。

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS。

- [ ] **Step 2: Run focused tests**

Run: `npm run test -- src/lib/analysis src/lib/budget src/lib/initiatives`
Expected: PASS 或回報既有失敗。

- [ ] **Step 3: Review changed files**

Run: `git diff -- src/app/dashboard/page.tsx src/app/campaigns/page.tsx src/components/campaigns/campaign-table.tsx src/components/dashboard/priority-workbench.tsx src/components/alerts/alert-list.tsx src/components/alerts/alert-card.tsx docs/superpowers/plans/2026-08-27-uiux-workflow-priorities.md`
Expected: Diff 只包含本計劃範圍。

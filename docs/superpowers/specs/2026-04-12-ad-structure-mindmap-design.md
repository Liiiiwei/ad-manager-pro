# 廣告架構心智圖 — 設計規格

## 概述

在 Ad Manager Pro 新增「廣告架構」頁面，以互動式心智圖呈現完整的廣告階層結構（Account → Campaign → Ad Set → Ad），讓使用者能一眼掌握所有廣告架構，同時透過指標與異常標示快速診斷表現。

## 技術選型

**React Flow** + **dagre**（自動排版）

選擇理由：
- 支援自訂節點元件（在節點內顯示指標、警告圖示）
- 開箱支援拖曳、縮放、平移
- 展開/收合邏輯可完全控制
- 與 Next.js / React 19 相容
- dagre 處理水平樹狀自動排版

## 資料結構

### 階層

```
Root (所有帳戶)
├─ Account (account_name)
│  ├─ Campaign (campaign)
│  │  ├─ Ad Set (adset)
│  │  │  ├─ Ad (ad_name)
│  │  │  └─ Ad (ad_name)
│  │  └─ Ad Set (adset)
│  └─ Campaign (campaign)
└─ Account (account_name)
```

### 節點資料介面

```typescript
interface TreeNode {
  id: string;
  label: string;
  level: 'account' | 'campaign' | 'adset' | 'ad';
  platform: string; // 'facebook' | 'google' 等
  metrics: {
    spend: number;
    roas: number;
    ctr: number;
    cpc: number;
  };
  alertCount: number;
  childCount: number;
  children: TreeNode[];
}
```

### 聚合邏輯

- `spend`：下層加總
- `roas`、`ctr`、`cpc`：以 spend 為權重的加權平均
- `alertCount`：下層 alert 數量向上冒泡加總

### 資料來源

- 呼叫現有 `/api/windsor` endpoint 取得 `WindsorAdRecord[]`
- 前端將扁平資料轉換成 `TreeNode` 樹狀結構
- 同時呼叫 `/api/analyze` 取得 alerts，映射到對應節點

## 節點外觀

### 正常狀態

```
┌──────────────────────────────┐
│ 🟢 Meta  Campaign 名稱       │  ← 平台圖示 + 名稱
│                              │
│  Spend $12,300   ROAS 3.2x   │  ← 指標第一行
│  CTR 2.1%        CPC $0.85   │  ← 指標第二行
│                              │
│  ▸ 3 Ad Sets                 │  ← 收合時顯示子節點數量
└──────────────────────────────┘
```

### 異常狀態

```
┌──────────────────────────────┐  ← 紅色邊框（2px solid red）
│ 🟢 Meta  Campaign 名稱  ⚠️ 2 │  ← 右上角警告圖示 + alert 數量
│                              │
│  Spend $12,300   ROAS 0.8x   │
│  CTR 0.5%        CPC $3.20   │
│                              │
│  ▸ 3 Ad Sets                 │
└──────────────────────────────┘
```

### 各層級視覺區分

| 層級 | 尺寸 | 樣式 |
|------|------|------|
| Account | 最大 | 深色標題列 |
| Campaign | 中等 | 標準卡片 |
| Ad Set | 較小 | 稍淡背景 |
| Ad | 最小 | 最輕量卡片 |

## 互動行為

### 畫布操作

- 滾輪縮放（zoom in/out）
- 拖曳平移畫布
- 右上角 zoom 控制鈕 + 「fit to view」按鈕（React Flow 內建 Controls）

### 節點互動

| 操作 | 行為 |
|------|------|
| 單擊展開箭頭 `▸` | 展開/收合子節點 |
| 單擊節點卡片本體 | 右側彈出詳情面板 |
| 雙擊節點卡片 | 導航到對應頁面（目前僅 `/campaigns`） |

### 展開/收合

- 點擊 `▸` 展開子節點，箭頭變 `▾`
- React Flow 使用 dagre 重新排版，帶動畫過渡
- 初始狀態：預設展開到 Account → Campaign 層級（前兩層）
- Ad Set 和 Ad 層級收合，使用者手動點開
- 如果只有一個 Account，自動再展開一層到 Ad Set

### 側邊詳情面板（Slide-over panel）

- 從右側滑入，寬度 400px
- 面板外點擊或按 ESC 關閉
- 內容依層級：

**所有層級共通：**
- 完整指標表格（spend, impressions, clicks, conversions, revenue, ROAS, CTR, CPC, CPM）
- 該節點的 alerts 列表（從 analysis engine 取得）

**Campaign / Ad Set 額外：**
- 下層子節點的 mini 排行榜（Top 5 by spend）

## 頁面整合

### 路由

`/ad-structure` — 獨立全頁面

### 側邊欄

- 在現有 Sidebar 新增「廣告架構」項目
- 使用樹狀圖 icon
- 位置：放在「Campaigns」下方

### 頂部工具列

復用現有 Header 元件，包含：
- **平台篩選** — 全部 / Meta / Google（復用 `account-filter`）
- **日期範圍** — 復用現有日期選擇器（last_7d, last_30d 等）
- **搜尋框** — 關鍵字即時高亮匹配節點（名稱模糊搜尋）
- **全部展開 / 全部收合** 按鈕

### 狀態處理

| 狀態 | 呈現 |
|------|------|
| Loading | 中央 spinner +「載入廣告架構中...」 |
| Empty | Empty state：「尚無廣告資料，請先到設定頁面連結 Windsor API」 |
| Error | 錯誤訊息 + 重試按鈕 |

## 佈局方向

水平展開（左到右） — 根節點在左，越往右層級越深。使用 dagre 的 `rankdir: 'LR'` 設定。

## 新增依賴

- `@xyflow/react` — React Flow v12（節點圖核心）
- `dagre` — 自動排版演算法
- `@types/dagre` — TypeScript 型別

## 檔案結構規劃

```
src/
├─ app/ad-structure/
│  └─ page.tsx                    # 頁面入口
├─ components/ad-structure/
│  ├─ ad-structure-flow.tsx       # React Flow 畫布主元件
│  ├─ nodes/
│  │  ├─ account-node.tsx         # Account 層級自訂節點
│  │  ├─ campaign-node.tsx        # Campaign 層級自訂節點
│  │  ├─ adset-node.tsx           # Ad Set 層級自訂節點
│  │  └─ ad-node.tsx              # Ad 層級自訂節點
│  ├─ detail-panel.tsx            # 右側詳情面板
│  └─ toolbar.tsx                 # 搜尋 + 展開/收合按鈕
├─ lib/ad-structure/
│  ├─ transform.ts                # WindsorAdRecord[] → TreeNode 轉換
│  ├─ layout.ts                   # dagre 排版計算
│  └─ types.ts                    # TreeNode 等型別定義
```

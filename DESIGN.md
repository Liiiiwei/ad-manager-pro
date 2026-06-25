# Ad Manager Pro — 設計系統

> 單一事實來源：所有顏色與字體都走 `src/app/globals.css` 的 CSS 變數 → Tailwind token。
> 元件請用 token 類別（`bg-accent`、`text-muted`、`font-mono`…），**不要**硬寫色票（`bg-blue-500`）。

## 設計意圖

**記憶點**：「專業投手在用的精密儀表」——冷靜、專業、有自信，數字清楚、判斷快。
刻意避開「每個 SaaS 儀表板都長一樣」的罐頭感（系統字 + 通用藍）。

## 字體

| 角色 | 字體 | Token | 用途 |
|------|------|-------|------|
| 內文 / UI | Geist Sans | `font-sans`（預設） | 全站預設字 |
| 標題 / 品牌 | Bricolage Grotesque | `font-display` | 拉丁標題、品牌名（中文會 fallback，故僅拉丁字有效） |
| 數據 / 數字 | Geist Mono | `font-mono` | KPI 數值、% 變化，搭配 `tabular-nums` 對齊 |

- 字體在 `src/app/layout.tsx` 用 `next/font` 載入，注入 `--font-geist-sans`／`--font-geist-mono`／`--font-bricolage`。
- `globals.css` 的 `@theme inline` 把這三個變數對應成 `font-sans`／`font-mono`／`font-display`。
- **數字一律加 `tabular-nums`**（等寬數字），表格與 KPI 才不會跳動。

## 顏色

### 品牌 / 動作色（靛）
| Token | 值 | 用途 |
|-------|-----|------|
| `accent` | `#4f46e5` | 主要按鈕、連結、啟用態、focus |
| `accent-hover` | `#4338ca` | 按鈕 hover（**不要**用 `hover:bg-blue-600`） |
| `accent-light` | `#eef2ff` | 淡底（icon 底、active 背景） |

### 語意色（顏色＝意義，勿混用）
| Token | 值 | 意義 |
|-------|-----|------|
| `info` | `#3b82f6` | 資訊提示（藍）—— 與品牌靛**刻意分離** |
| `success` | `#22c55e` | 表現好、正成長 |
| `warning` | `#f59e0b` | 需注意 |
| `danger` | `#ef4444` | 表現差、負成長、錯誤 |

> ⚠️ 品牌色是靛、info 是藍，兩者不同色。alert/detail 的藍是 **info 語意**，請維持藍；
> 按鈕等動作元件一律用 `accent`。

### 中性色（冷 slate，勿改暖）
| Token | 值 | 用途 |
|-------|-----|------|
| `background` | `#f1f5f9` | 頁面底 |
| `foreground` | `#0f172a` | 主文字 |
| `card` | `#ffffff` | 卡片底 |
| `card-border` | `#e2e8f0` | 卡片框線 |
| `muted` | `#64748b` | 次要文字 |

> 全站大量硬寫 slate / gray，中性色**必須維持冷色**，改暖會與既有色撞濁。

### 側邊欄（深藍 navy）
`sidebar-bg` `#0f172a`／`sidebar-text` `#94a3b8`／`sidebar-active` `#4f46e5`（跟品牌靛）／`sidebar-hover` `rgba(255,255,255,.06)`。

## 規則（anti-slop）

1. **不用漸層**做品牌色——靛是 flat solid，不疊 gradient。
2. **顏色帶意義**：green/amber/red 對應數據好壞，品牌靛不參與數據語意，避免誤讀。
3. **新元件用 token**，不要硬寫 `bg-blue-*`／`text-blue-*`；需要藍＝info 時用 `bg-info`／`text-info`。
4. **數字配 `font-mono tabular-nums`**。
5. UI 四態（loading／error／empty／success）沿用既有元件（`skeleton`、`empty-state`、`animate-fade-in`）。

## 檔案

- 色彩 / 字體 token：`src/app/globals.css`
- 字體載入：`src/app/layout.tsx`
- 動畫（skeleton / fade-in / slide-in / card-hover）：`src/app/globals.css`

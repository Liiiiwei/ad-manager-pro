# Ad Manager Pro

專業級廣告管理與最佳化平台，整合 Windsor.ai 與 Notion，提供完整的廣告數據分析與自動化報告功能。

## 功能特色

### 📊 數據視覺化
- **即時 Dashboard**：KPI 指標總覽（花費、營收、ROAS、轉換數）
- **ROAS 與訂單趨勢圖**：雙 Y 軸圖表，同時追蹤 ROAS 與訂單數變化
- **花費趨勢分析**：每日廣告花費視覺化
- **多帳號支援**：支援多選篩選，靈活對比不同廣告帳號表現

### 🔔 智能警示系統
- **自動異常偵測**：
  - 預算異常（超支、低消）
  - 效能下滑（CTR、轉換率、ROAS）
  - 創意疲勞（頻率過高）
- **帳號分組顯示**：警示依帳號分類，快速定位問題
- **嚴重度分級**：Critical / Warning / Info 三級分類

### 📋 廣告活動管理
- **完整活動列表**：支援排序、篩選、搜尋
- **多維度指標**：展示所有重要指標（CPC、CPM、CTR、ROAS 等）
- **即時狀態追蹤**：掌握每個活動的最新表現

### 📝 Notion 整合
- **自動報告產生**：一鍵產生結構化廣告最佳化報告
- **報告內容包含**：
  - 總覽數據表格
  - Meta vs Google 平台比較
  - 分級警示與建議行動
  - 資料範圍與產生時間
- **直接發佈到 Notion**：透過 MCP 整合，無需手動複製貼上

### 🎯 平台支援
- **Meta Ads**：Facebook & Instagram 廣告數據
- **Google Ads**：Google 搜尋、展示、購物廣告
- **跨平台分析**：統一介面管理多平台數據

## 技術架構

### 前端技術棧
- **框架**：Next.js 16（App Router）
- **UI 框架**：React 19 + TypeScript
- **樣式**：Tailwind CSS 4
- **圖表**：Recharts 2.15
- **表格**：TanStack Table 8
- **型別驗證**：Zod 3

### 資料來源
- **Windsor.ai API**：統一廣告數據接口
- **支援平台**：Meta、Google Ads（可擴充更多平台）

### 專案結構

```
ad-manager-pro/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── dashboard/          # Dashboard 頁面
│   │   ├── campaigns/          # 廣告活動頁面
│   │   ├── alerts/             # 警示頁面
│   │   ├── settings/           # 設定頁面
│   │   └── api/                # API Routes
│   │       ├── windsor/        # Windsor.ai 整合
│   │       ├── analyze/        # 分析引擎
│   │       └── notion/         # Notion 報告產生
│   ├── components/             # React 組件
│   │   ├── dashboard/          # Dashboard 相關組件
│   │   ├── campaigns/          # 活動管理組件
│   │   ├── alerts/             # 警示組件
│   │   ├── layout/             # 版面組件
│   │   └── ui/                 # UI 基礎組件
│   ├── lib/                    # 核心邏輯
│   │   ├── windsor/            # Windsor.ai 客戶端
│   │   ├── analysis/           # 分析引擎
│   │   │   ├── engine.ts       # 主分析引擎
│   │   │   ├── budget-anomaly.ts
│   │   │   ├── performance.ts
│   │   │   ├── creative-fatigue.ts
│   │   │   └── recommendations.ts
│   │   ├── notion/             # Notion 整合
│   │   └── utils/              # 工具函數
│   └── hooks/                  # React Hooks
└── public/                     # 靜態資源
```

## 快速開始

### 環境需求
- Node.js 20+
- Windsor.ai API Key
- （選用）Notion 帳號 + MCP 整合

### 安裝步驟

1. **安裝依賴**
```bash
npm install
```

2. **設定 API Key**
   - 啟動開發伺服器
   - 前往 Settings 頁面
   - 輸入 Windsor.ai API Key

3. **啟動開發伺服器**
```bash
npm run dev
```

4. **開啟瀏覽器**
```
http://localhost:3000
```

### 可用指令

```bash
# 開發模式
npm run dev

# 建構正式版本
npm run build

# 啟動正式版本
npm run start

# 程式碼檢查
npm run lint
```

## Zeabur 部署

### 部署步驟

1. **推送程式碼到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **在 Zeabur 建立專案**
   - 登入 [Zeabur Dashboard](https://dash.zeabur.com)
   - 點擊 "Create Project"
   - 選擇 "Connect GitHub Repository"
   - 選擇你的 repository

3. **設定環境變數**

   在 Zeabur Dashboard 的 "Variables" 或 "環境變數" 設定中，新增以下變數：

   ```bash
   # 必要變數
   WINDSOR_API_KEY=<your-windsor-api-key>

   # Notion 自動同步（選填）
   NOTION_API_KEY=<your-notion-integration-token>
   NOTION_PARENT_PAGE_ID=<notion-page-id>

   # 排程設定（選填）
   CRON_SCHEDULE=0 9 * * *        # 預設每天 9:00 (UTC)
   ENABLE_AUTO_SYNC=true          # 預設啟用
   TZ=Asia/Taipei                 # 設定時區
   ```

4. **部署**
   - Zeabur 會自動偵測 Next.js 專案並開始部署
   - 等待部署完成（通常 2-5 分鐘）

5. **驗證部署**
   - 開啟 Zeabur 提供的網址
   - 檢查應用是否正常運作
   - 查看 Logs 確認 Cron Job 是否成功註冊

### Notion 自動同步設定

#### 1. 建立 Notion Integration

1. 前往 [Notion Integrations](https://www.notion.so/my-integrations)
2. 點擊 "New integration"
3. 設定名稱（例如：Ad Manager Pro）
4. 選擇你的 Workspace
5. 複製 "Internal Integration Token"（這就是 `NOTION_API_KEY`）

#### 2. 建立 Parent Page

1. 在 Notion 中建立一個新頁面（例如：「廣告報告」）
2. 點擊頁面右上角的 "Share"
3. 點擊 "Invite"，找到剛才建立的 Integration，邀請它
4. 從頁面 URL 複製 Page ID 作為 `NOTION_PARENT_PAGE_ID`

   **如何取得 Page ID：**
   - URL 格式：`https://notion.so/workspace/Page-Title-abc123def456...`
   - Page ID 就是最後面的 32 位字串：`abc123def456...`

#### 3. 測試自動同步

部署完成後，可以手動觸發同步測試：

```bash
curl -X POST https://your-app.zeabur.app/api/sync-notion
```

成功的回應：
```json
{
  "success": true,
  "message": "Notion 同步已完成",
  "timestamp": "2024-01-15T09:00:00.000Z"
}
```

檢查 Notion Parent Page 下是否成功建立新報告頁面。

#### 4. 排程說明

- **CRON_SCHEDULE 格式**：`分 時 日 月 週`
- **範例**：
  - `0 9 * * *` - 每天 9:00
  - `0 */6 * * *` - 每 6 小時一次
  - `0 9 * * 1` - 每週一 9:00
  - `0 9 1 * *` - 每月 1 號 9:00

- **時區設定**：使用 `TZ` 環境變數設定時區（例如：`Asia/Taipei`）

#### 5. 檢視同步記錄

在 Zeabur Dashboard 的 Logs 中可以看到：
- Cron Job 註冊訊息
- 每日同步執行記錄
- Windsor API 呼叫狀態
- Notion API 建立頁面狀態
- 錯誤訊息（如有）

### 環境變數完整清單

| 變數名稱 | 必要性 | 預設值 | 說明 |
|---------|--------|--------|------|
| `WINDSOR_API_KEY` | 必要 | - | Windsor.ai API Key |
| `NOTION_API_KEY` | 選填 | - | Notion Integration Token（啟用自動同步時必要） |
| `NOTION_PARENT_PAGE_ID` | 選填 | - | Notion Parent Page ID（啟用自動同步時必要） |
| `CRON_SCHEDULE` | 選填 | `0 9 * * *` | Cron 排程表達式 |
| `ENABLE_AUTO_SYNC` | 選填 | `true` | 是否啟用自動同步 |
| `TZ` | 選填 | `UTC` | 時區設定（例如：`Asia/Taipei`） |

## 使用指南

### Dashboard 使用

1. **選擇日期範圍**：Header 提供快速日期範圍選擇器
2. **選擇平台**：可選擇 Meta、Google 或全部
3. **篩選帳號**：
   - 點擊帳號下拉選單
   - 勾選要檢視的帳號（支援多選）
   - 資料與圖表即時更新
4. **檢視警示**：下方警示區塊會依帳號分組顯示最重要的警示

### 產生 Notion 報告

#### 方式一：使用 API

```typescript
const response = await fetch('/api/notion/report', {
  method: 'POST',
  headers: {
    'x-windsor-api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    dateRange: 'last_7d'  // last_7d, last_14d, last_30d, custom
  })
});

const { title, content, analysis } = await response.json();
```

#### 方式二：透過 Claude Code + Notion MCP

如果你使用 Claude Code，系統已經整合 Notion MCP，可以直接產生並發佈報告到 Notion。

### 日期範圍選項

- `last_7d`：最近 7 天
- `last_14d`：最近 14 天
- `last_30d`：最近 30 天
- 自訂日期範圍（透過 `date_from` 和 `date_to` 參數）

## 分析引擎

### 警示類型

#### 1. 預算異常（Budget Anomaly）
- **超支警示**：花費超過預期
- **低消警示**：花費低於預期
- **CPC/CPM 飆升**：成本異常上升

#### 2. 效能警示（Performance）
- **CTR 下滑**：點擊率明顯降低
- **轉換率下滑**：轉換效率降低
- **ROAS 過低**：投資報酬率低於門檻

#### 3. 創意疲勞（Creative Fatigue）
- **高頻率警示**：廣告曝光頻率過高
- **CTR 衰退**：創意效果疲軟

#### 4. 最佳化建議（Recommendations）
- **擴量建議**：ROAS 表現優異，建議加碼
- **停用建議**：ROAS 過低，建議停止投放

### 可調整門檻

所有警示門檻都可在 [src/lib/analysis/thresholds.ts](src/lib/analysis/thresholds.ts) 中調整。

## API 文件

### Windsor.ai 整合

#### GET `/api/windsor`
取得廣告數據

**Query Parameters:**
- `dateRange`: 日期範圍（預設：last_7d）
- `platform`: 平台（meta | google_ads | all）

**Headers:**
- `x-windsor-api-key`: Windsor.ai API Key

### 分析引擎

#### POST `/api/analyze`
執行完整廣告數據分析

**Request Body:**
```json
{
  "dateRange": "last_7d"
}
```

**Headers:**
- `x-windsor-api-key`: Windsor.ai API Key

**Response:**
```json
{
  "generatedAt": "2024-01-01T00:00:00Z",
  "dateRange": { "from": "2024-01-01", "to": "2024-01-07" },
  "summary": {
    "totalSpend": 10000,
    "totalRevenue": 25000,
    "overallRoas": 2.5,
    "totalConversions": 100,
    "avgCpc": 1.5,
    "avgCtr": 2.3
  },
  "alerts": [...],
  "platformBreakdown": { ... }
}
```

### Notion 報告

#### POST `/api/notion/report`
產生 Notion 格式報告

**Request Body:**
```json
{
  "dateRange": "last_7d"
}
```

**Headers:**
- `x-windsor-api-key`: Windsor.ai API Key

**Response:**
```json
{
  "title": "2024-01-01 ~ 2024-01-07 廣告最佳化報告",
  "content": "## 總覽\n\n...",
  "analysis": { ... }
}
```

## 部署

### Vercel（推薦）

1. 連結 GitHub Repository
2. 設定環境變數（如需要）
3. 部署

### 其他平台

```bash
npm run build
npm run start
```

## 環境變數

目前 API Key 儲存在瀏覽器 localStorage，適合個人使用。
如需團隊共用或正式環境，建議改用環境變數：

```env
WINDSOR_API_KEY=your_api_key_here
```

## 更新日誌

### v0.2.0 (最新)
- ✨ ROAS 圖表新增訂單數指標（雙 Y 軸）
- ✨ 警示區塊支援依帳號分組顯示
- ✨ 帳號篩選器改為多選勾選框
- 📝 完整 README 文件

### v0.1.0
- 🎉 初始版本發佈
- ✅ Dashboard 基礎功能
- ✅ Windsor.ai 整合
- ✅ 分析引擎
- ✅ Notion 報告產生

## 授權

MIT License

## 技術支援

如有問題或建議，請透過 Issue 提出。

---

**Built with ❤️ using Next.js 16 & Windsor.ai**

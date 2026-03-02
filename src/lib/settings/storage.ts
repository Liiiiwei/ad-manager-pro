import fs from "fs";
import path from "path";

const SETTINGS_DIR = path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

export interface NotionSettings {
  apiKey?: string;
  parentPageId?: string;
  enabled?: boolean;
}

export interface CronSettings {
  schedule?: string;
  timezone?: string;
}

export interface WindsorSettings {
  dateRange?: string;
}

export interface AppSettings {
  notion?: NotionSettings;
  cron?: CronSettings;
  windsor?: WindsorSettings;
  updatedAt?: string;
}

/**
 * 確保設定目錄存在
 */
function ensureSettingsDir() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * 從檔案載入設定
 */
export function loadSettings(): AppSettings {
  try {
    ensureSettingsDir();

    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }

    const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("載入設定失敗:", error);
    return {};
  }
}

/**
 * 儲存設定到檔案
 */
export function saveSettings(settings: AppSettings): void {
  try {
    ensureSettingsDir();

    const updatedSettings: AppSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2), "utf-8");
    console.log("✅ 設定已儲存至", SETTINGS_FILE);
  } catch (error) {
    console.error("儲存設定失敗:", error);
    throw new Error("無法儲存設定");
  }
}

/**
 * 更新部分設定（merge）
 */
export function updateSettings(partial: Partial<AppSettings>): void {
  const current = loadSettings();
  const updated = {
    ...current,
    ...partial,
    // Deep merge for nested objects
    notion: { ...current.notion, ...partial.notion },
    cron: { ...current.cron, ...partial.cron },
    windsor: { ...current.windsor, ...partial.windsor },
  };
  saveSettings(updated);
}

/**
 * 取得 Notion 設定（供 Cron 使用）
 * 優先順序：JSON 檔案 > 環境變數
 */
export function getNotionConfig(): {
  apiKey: string | undefined;
  parentPageId: string | undefined;
  enabled: boolean;
} {
  const settings = loadSettings();
  const fileConfig = settings.notion || {};

  return {
    apiKey: fileConfig.apiKey || process.env.NOTION_API_KEY,
    parentPageId: fileConfig.parentPageId || process.env.NOTION_PARENT_PAGE_ID,
    enabled: fileConfig.enabled ?? true,
  };
}

/**
 * 取得 Cron 設定
 */
export function getCronConfig(): {
  schedule: string;
  timezone: string;
} {
  const settings = loadSettings();
  const fileConfig = settings.cron || {};

  return {
    schedule: fileConfig.schedule || process.env.CRON_SCHEDULE || "0 9 * * *",
    timezone: fileConfig.timezone || process.env.TZ || "UTC",
  };
}

/**
 * 遮罩 API Key（用於前端顯示）
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) {
    return "***";
  }
  const start = apiKey.slice(0, 7);
  const end = apiKey.slice(-3);
  return `${start}***...***${end}`;
}

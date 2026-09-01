# 本機 Docker 執行說明

雙擊一個 app 圖示，就能在自己的 Mac 上把 Ad Manager Pro（含資料庫）跑起來，免登入直接使用。

## 前置需求

- 安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 並至少開啟過一次。

## 首次設定（一次即可）

1. **產生環境變數檔**（在 repo 根目錄執行）：
   ```bash
   cp docker/.env.docker.example docker/.env.docker
   ```
2. **填入加密金鑰**（設定頁存 API 金鑰會用到）：
   ```bash
   KEY=$(openssl rand -hex 32)
   sed -i '' "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$KEY/" docker/.env.docker
   ```
3. **首次啟動並 build**（約數分鐘）：雙擊 `AdManagerPro.app`，或執行 `docker compose up -d --build`。

> `docker/.env.docker` 內含金鑰，已被 `.gitignore` 排除，切勿提交。

## 日常使用

- **啟動**：雙擊 `AdManagerPro.app`（會自動開 Docker、起服務、開瀏覽器到 `http://localhost:3000`）。
- **停止**：雙擊 `AdManagerPro-Stop.app`（停止服務、保留資料）。
- 想加到 Dock：把 `AdManagerPro.app` 拖到 Dock（`.app` 須留在 repo 根目錄，launcher 以自身位置推導專案路徑）。

## 常見問題

- **雙擊 app 後沒有任何反應**：多半是 Docker Desktop 尚未安裝或尚未啟動完成。請先確認已安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 並手動開啟、等待右上角鯨魚圖示變為執行中，再重新雙擊 `AdManagerPro.app`。首次啟動需 build image（約數分鐘），期間瀏覽器尚不會自動打開，屬正常現象，請耐心等候。
- **首次開啟被 macOS 攔（「無法驗證開發者」）**：到「系統設定 → 隱私權與安全性」按「仍要開啟」，或執行：
  ```bash
  xattr -dr com.apple.quarantine AdManagerPro.app AdManagerPro-Stop.app
  ```
- **port 3000 被占用**：先關掉占用程式，或改 `docker-compose.yml` 的 `ports` 為 `"3001:3000"` 後改用 `http://localhost:3001`。
- **完全清除資料重來**：`docker compose down -v`（`-v` 會刪掉資料 volume，資料無法復原）。
- **免登入說明**：本機以 `LOCAL_NO_AUTH=true` 放行 dev fallback 使用者，不需要 Clerk 帳號；此旗標僅存在於本機 `docker/.env.docker`，正式站不受影響。

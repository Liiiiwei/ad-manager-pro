#!/bin/bash
# 定位 node 並把它的目錄加進 PATH（讓 npm/npx 一起可用）。
# 解決 Finder 雙擊 .app 不繼承使用者 shell PATH 的問題。
# 用法：source 本檔。成功後 $NODE 指向 node，PATH 已含其目錄；失敗則跳 alert 並 exit 1。

find_node() {
  # 1. 現有 PATH
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  # 2. 常見安裝路徑
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
  # 3. nvm 目前版本
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
    command -v node >/dev/null 2>&1 && { command -v node; return; }
  fi
  # 4. 用登入 shell 解析（涵蓋自訂 PATH 設定）
  local viashell
  viashell="$("$SHELL" -lc 'command -v node' 2>/dev/null)" || true
  [ -n "$viashell" ] && { echo "$viashell"; return; }
}

# set -e 下，命令替換賦值失敗會提前中止；用 || true 讓找不到 node 時仍能走到下方 alert
NODE="$(find_node)" || true
if [ -z "$NODE" ]; then
  osascript -e 'display alert "找不到 Node.js" message "請先安裝 Node.js 20 以上版本（例如 Homebrew：brew install node），再重新開啟 Ad Manager Pro。"' >/dev/null 2>&1
  exit 1
fi
export NODE
export PATH="$(dirname "$NODE"):$PATH"

# 決定執行架構：Finder／LaunchServices 雙擊時，可能把「通用二進位 node」以非原生
# slice 執行（實測：arm64 機器上被以 x86_64 執行），使 process.arch 與 npm install 當時
# 選到的原生模組 binary（embedded-postgres 的 @embedded-postgres/darwin-arm64）不符而崩潰
# （ERR_MODULE_NOT_FOUND: Cannot find package '@embedded-postgres/darwin-x64'）。
# 對策：讓 node 的執行架構對齊 node_modules 內實際安裝的 embedded-postgres 平台二進位——
# 這是地面真相（npm install 依當時 process.arch 只裝一個）。
# 注意：不能用 uname -m 判硬體——它回報「當前程序」架構，本檔被以 x86_64 啟動時就回 x86_64，
# 反而選錯。故改看已安裝的 binary 目錄名。
# 用 BASH_SOURCE 定位本檔所在，往上兩層即專案根，避免依賴呼叫端的變數。
# 供 source 本檔的 launcher 用：exec "${NODE_ARCH_PREFIX[@]}" "$NODE" ...
NODE_ARCH_PREFIX=()
_fn_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
_ep_dir="$_fn_root/node_modules/@embedded-postgres"
_want_arch=""
if [ -d "$_ep_dir/darwin-arm64" ]; then
  _want_arch="arm64"
elif [ -d "$_ep_dir/darwin-x64" ]; then
  _want_arch="x86_64"
fi
# 僅在能以該架構實際跑起 node 時才加前綴（功能測試）；否則交回系統預設，不強制。
if [ -n "$_want_arch" ] && arch -"$_want_arch" "$NODE" -e '' >/dev/null 2>&1; then
  NODE_ARCH_PREFIX=(arch -"$_want_arch")
fi

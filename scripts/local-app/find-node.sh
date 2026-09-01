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

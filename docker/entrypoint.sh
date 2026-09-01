#!/bin/sh
# 容器啟動流程：等 DB 就緒 → 套用 schema（prisma db push）→ 啟動應用
set -e

echo "[entrypoint] 套用資料庫結構 (prisma db push)..."
# 重試以防 DB 尚未完全就緒（compose 已用 depends_on healthy，這裡是雙保險）
n=0
until npx prisma db push --skip-generate; do
  n=$((n + 1))
  if [ "$n" -ge 10 ]; then
    echo "[entrypoint] prisma db push 連續失敗，放棄"
    exit 1
  fi
  echo "[entrypoint] DB 尚未就緒，第 $n 次重試..."
  sleep 3
done

echo "[entrypoint] 啟動應用..."
exec "$@"

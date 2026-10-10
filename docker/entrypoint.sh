#!/bin/sh
set -e

cmd="${1:-web}"
case "$cmd" in
  web)
    # 启动前自动 migrate（带 advisory lock，web 和 worker 同时启动也安全）
    node /app/apps/worker/dist/migrate.js
    cd /app/apps/web
    exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    exec node /app/apps/worker/dist/index.js
    ;;
  migrate)
    exec node /app/apps/worker/dist/migrate.js
    ;;
  *)
    exec "$@"
    ;;
esac

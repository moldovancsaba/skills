#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.local-mongo/data"
LOG_DIR="$ROOT_DIR/.local-mongo/logs"
LOG_FILE="$LOG_DIR/mongod.log"
PORT="${LOCAL_DATABASE_PORT:-27017}"
REPLICA_SET="${LOCAL_DATABASE_REPLICA_SET:-rs0}"
HOST="${LOCAL_DATABASE_HOST:-127.0.0.1}"
ADMIN_URL="mongodb://$HOST:$PORT/admin"

mkdir -p "$DATA_DIR" "$LOG_DIR"

if ! command -v mongod >/dev/null 2>&1; then
  echo "mongod is not installed. Install mongodb-community@8.0 first." >&2
  exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh is not installed. Install mongodb-community@8.0 first." >&2
  exit 1
fi

if ! nc -z "$HOST" "$PORT" >/dev/null 2>&1; then
  mongod \
    --dbpath "$DATA_DIR" \
    --logpath "$LOG_FILE" \
    --fork \
    --bind_ip "$HOST" \
    --port "$PORT" \
    --replSet "$REPLICA_SET"
fi

STATUS="$(mongosh --quiet --eval 'try { rs.status().ok } catch (e) { print(0) }' "$ADMIN_URL" || true)"
if [[ "$STATUS" != "1" ]]; then
  mongosh --quiet --eval "rs.initiate({_id:\"$REPLICA_SET\",members:[{_id:0,host:\"$HOST:$PORT\"}]})" "$ADMIN_URL" >/dev/null
fi

echo "Local audit Mongo ready at mongodb://$HOST:$PORT/checklist_local?replicaSet=$REPLICA_SET"

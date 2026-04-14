#!/bin/bash

# Sovereign watchdog.sh
# Monitors and restarts the synthesis worker if it crashes.

ROOT_DIR="/Users/Shared/Projects/checklist"
WORKER_CMD="node scripts/sync.js"
LOG_FILE="$ROOT_DIR/agents_worker.log"

export PATH=$PATH:/opt/homebrew/bin

echo "$(date): Sovereign Watchdog Ignition..." >> $LOG_FILE

while true; do
  if ! pgrep -f "$WORKER_CMD" > /dev/null; then
    echo "$(date): [WATCHDOG] Worker not found. Relaunching..." >> $LOG_FILE
    cd $ROOT_DIR && $WORKER_CMD >> $LOG_FILE 2>&1 &
  fi
  sleep 60
done

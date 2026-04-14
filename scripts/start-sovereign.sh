#!/bin/bash
# Sovereign AI Worker Start Script
# Designed for macOS LaunchAgent execution

# 1. Configuration
PROJECT_DIR="/Users/Shared/Projects/checklist"
NODE_PATH="/opt/homebrew/bin/node"
WORKER_SCRIPT="scripts/sync.js"
LOG_FILE="$PROJECT_DIR/agents_worker.log"

# 2. Setup Environment
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$PROJECT_DIR" || exit 1

echo "[$(date)] --- Launching Sovereign AI Worker ---" >> "$LOG_FILE"

# 3. Validation
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "ERROR: .env file missing in $PROJECT_DIR" >> "$LOG_FILE"
    exit 1
fi

# 4. Execute
# We use node directly so launchd can monitor the process.
# We pipe logs to our central log file but also let launchd capture stdout/stderr in plist.
exec "$NODE_PATH" "$WORKER_SCRIPT" >> "$LOG_FILE" 2>&1

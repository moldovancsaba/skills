# CHECK Local Managed Runtime Fleet

This runbook defines the local 24/7 runtime contract for CHECK Local. It covers the managed service manifest, Guardian reconciliation, queue circuit breakers, health states, recovery controls, resource accounting, and verification gates.

## Managed Services

The source of truth is `scripts/lib/runtime/managed-services.js`.

| Service | Criticality | Health | Owner | Restart Policy |
| --- | --- | --- | --- | --- |
| `check-local-guardian` | critical | process title | launchd/terminal | disabled in manifest |
| `check-local-foreground` | critical | `http://127.0.0.1:10005/health` | Guardian | enabled, bounded per hour |
| `check-local-snapshot` | degraded-ok | `http://127.0.0.1:10007/health` | Guardian | enabled, bounded per hour |
| `check-local-status` | critical | `http://127.0.0.1:10006/health` | Guardian | enabled, bounded per hour |
| `destination-daemon` | degraded-ok | `http://127.0.0.1:3000/api/destination-missions/daemon/health` | `com.sovereignsquad.check.local.destination-daemon` | launchd keepalive |
| `ollama` | critical | `http://127.0.0.1:11434/api/ps` | platform/app operator | restart disabled |

Guardian persists the latest reconciliation plan in `GlobalSetting.local_ai_managed_service_state`. The status server reads the same state and recomputes observations for the Runtime cockpit.

## Runtime Health

Unified health is computed in `scripts/lib/runtime/health-model.js`.

States:

- `HEALTHY`: no active incidents.
- `DEGRADED`: non-critical service or resource incident exists.
- `BLOCKED_INFRA`: a queue circuit breaker is open.
- `LOW_MEMORY`: the memory steward reports critical memory pressure.
- `QUEUE_STARVED`: runnable work exists but no worker is running it.
- `RECOVERING`: a managed service restart is in progress.
- `CRITICAL`: a critical service is down, blocked, or restart-limited.

The status server exposes this through `/api/status` under `runtimeHealth`.

## Destination Daemon Recovery

Destination daemon endpoint outages are classified as `DESTINATION_SERVICE_UNAVAILABLE` in `src/lib/pipeline-queue.js`.

When this class is detected:

1. The failed `DESTINATION_MISSION_DAEMON` job is cooled down.
2. Other active destination daemon jobs move to `LATER`.
3. The retry window is set to 30 minutes.
4. `GlobalSetting.local_ai_queue_circuit_breakers` receives an open `destination-service-unavailable` breaker.
5. Non-destination queue lanes remain runnable.

Operators can acknowledge or retry the breaker from the Runtime cockpit. Retry requires a reason and removes the active breaker; the queue jobs still respect their scheduled retry windows unless manually moved.

## Runtime Cockpit

The local status server runs at `http://127.0.0.1:10006`.

Runtime tab sections:

- Runtime incidents from the unified health reducer.
- Managed services with state, PID, wake, restart, and acknowledge controls.
- Circuit breakers with retry and acknowledge controls.
- Memory steward recommendations.
- Log pressure for Guardian logs.
- Queue actions for retry, park, fail, and acknowledge.
- Action log for operator evidence.

Destructive controls require confirmation and a reason. Runtime actions are persisted in `GlobalSetting.local_ai_runtime_action_log`.

## Resource Accounting

Memory accounting:

- `scripts/lib/runtime/memory-steward.js` collects process inventory, queue state, runtime guard policy, and macOS `vm_stat` accounting.
- `scripts/lib/runtime/resource-accounting.js` parses `vm_stat` into free, active, inactive, file-backed, anonymous, compressed, and reclaimable estimates.

Log accounting:

- Guardian rotates `logs/guardian.log` when it exceeds `CHECK_LOCAL_LOG_MAX_BYTES` or the default 50 MB.
- Guardian copy-truncates `logs/guardian-launchd.log` when it exceeds the same threshold because launchd owns that file handle.
- Retention defaults to 5 rotated files and can be changed with `CHECK_LOCAL_LOG_RETENTION`.
- The status server reports log pressure for Guardian and destination daemon launchd logs.

## Recovery Commands

Restart Guardian-owned foreground worker:

```bash
curl -sS -X POST http://127.0.0.1:10006/api/services/action \
  -H 'Content-Type: application/json' \
  -d '{"serviceId":"check-local-foreground","action":"restart","confirm":true,"reason":"operator recovery"}'
```

Retry destination breaker:

```bash
curl -sS -X POST http://127.0.0.1:10006/api/circuit-breakers/action \
  -H 'Content-Type: application/json' \
  -d '{"breakerId":"destination-service-unavailable","action":"retry","confirm":true,"reason":"daemon health verified"}'
```

Inspect unified health:

```bash
curl -sS http://127.0.0.1:10006/api/status | jq '.runtimeHealth'
```

Inspect daemon readiness:

```bash
curl -sS http://127.0.0.1:3000/api/destination-missions/daemon/health
```

Load or restart the destination daemon launchd service:

```bash
mkdir -p ~/Library/LaunchAgents
cp scripts/com.sovereignsquad.check.local.destination-daemon.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.sovereignsquad.check.local.destination-daemon.plist
launchctl kickstart -k "gui/$(id -u)/com.sovereignsquad.check.local.destination-daemon"
```

## Rollback

1. Stop accepting new operator actions by closing the status server tab.
2. Revert only the managed-runtime changes from the current commit.
3. Stop the destination daemon launchd service if the rollback removes the health route:

```bash
launchctl bootout "gui/$(id -u)/com.sovereignsquad.check.local.destination-daemon" || true
```

4. Restart Guardian or the status server.
5. Clear runtime-only settings if needed:

```bash
node -e 'const { PrismaClient } = require("@prisma/client"); const p = new PrismaClient(); Promise.all(["local_ai_managed_service_state","local_ai_queue_circuit_breakers"].map((key) => p.globalSetting.delete({ where: { key } }).catch(() => null))).finally(() => p.$disconnect())'
```

Do not clear `local_ai_runtime_action_log` during incident review.

## Proof Gates

Run focused contracts:

```bash
npm run test:managed-runtime
npm run test:runtime-hardening
npm run test:memory-steward
npm run test:runtime-console
node --check scripts/guardian.js
node --check scripts/status-server.js
```

Run application build:

```bash
npm run build
```

Deployment proof:

1. Restart the status server.
2. Verify `http://127.0.0.1:10006/health`.
3. Verify `/api/status` includes `runtimeHealth`, `managedServices`, `queueCircuitBreakers`, and `logPressure`.
4. If the webapp is running, verify `/api/destination-missions/daemon/health`.

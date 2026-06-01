# CHECK Local Runner Naming Standard

Every CHECK process that runs once or continuously must have a human-readable identity. Raw runtime names such as `node` are not acceptable as the only operational truth.

## Required fields

Each runner must define:

- `humanName`: the name operators see, for example `CHECK Local Guardian`
- `id`: the stable system id, for example `check.local.guardian`
- `processTitle`: the OS process title, for example `check-local-guardian`
- `kind`: `continuous` or `one-shot`
- `description`: what the runner actually does

The source of truth is `scripts/lib/runtime/runner-registry.js`.

## Current runners

- `CHECK Local Guardian`: keeps CHECK local background services alive and restarts unhealthy workers
- `CHECK Local Foreground Worker`: runs the queue-owned local intelligence mutation lane
- `CHECK Local Snapshot Worker`: maintains lifecycle topology, projections, snapshots, and runtime verification
- `CHECK Local Status Server`: serves the local operator status surface
- `CHECK Local Lifecycle Maintenance`: repairs unit jobs, destination missions, daemon lanes, and lifecycle topology
- `CHECK Local Lifecycle Verifier`: verifies that units, blocks, mission definitions, and daemon lanes are coherent

## Execution rule

Use the named executables in `bin/` instead of running raw `node scripts/...` commands for local CHECK runners.

Examples:

```sh
./bin/check-local-guardian
./bin/check-local-foreground-worker
./bin/check-local-snapshot-worker
./bin/check-local-status-server
./bin/check-local-lifecycle-maintenance
./bin/check-local-lifecycle-verify --strict
```

## LaunchAgent rule

macOS LaunchAgents must launch the named CHECK executable directly.

Correct:

```xml
<string>/Users/Shared/Projects/checklist/bin/check-local-guardian</string>
```

Incorrect:

```xml
<string>/opt/homebrew/bin/node</string>
<string>/Users/Shared/Projects/checklist/scripts/guardian.js</string>
```

The runtime may still be Node.js internally, but the human-facing runner must be CHECK-specific everywhere we control.

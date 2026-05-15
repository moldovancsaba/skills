# CHECKLIST Local AI Runtime Hardening LLD

This document defines the target low-level design and implementation plan for hardening the local AI runtime for 24/7 healthy operation.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [docs/LOCAL_AI_PIPELINE.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PIPELINE.md)

Important:

- this document is a target hardening design, not a claim that every item is already shipped
- the planner and quality engine remain the authoritative work contracts
- this document changes how the worker executes those contracts safely under continuous load

## 1. Purpose

The local AI runtime must behave like a dependable 24/7 operating system, not a best-effort background script.

Primary hardening goals:

- keep one foreground execution lane alive at all times
- protect card-producing work from background maintenance starvation
- survive low-memory conditions without lying about progress
- recover stale or hung work deterministically
- reduce operator confusion by making worker state truthful and simple
- preserve planner and quality-engine guarantees while making runtime behavior operationally safe

## 2. Verified Runtime Problems

This design exists because the current runtime still has structural weaknesses.

Verified problems in the current code path:

- the foreground worker loop still performs heavy non-job work before and after queue execution
- queue synchronization is still on the hot path in both `scripts/sync.js` and `scripts/lib/pipeline-jobs.js`
- snapshot refresh still shares the same execution lane as claimable planner work
- low-memory handling is partial; the runtime defers some work, but it still carries too much overhead in the main loop
- one logical worker can still look non-linear to operators because system chores happen around the claimed job
- stale `RUNNING` jobs can still distort operator perception unless heartbeat and reclaim rules stay strong
- observability currently mixes worker truth, queue truth, and maintenance truth more than it should

## 3. Design Principles

### 3.1 One foreground lane

At any moment, the runtime should have at most one foreground mutation lane:

1. recover stale claimed work if required
2. claim one job
3. execute one job
4. complete or fail one job
5. rest briefly

No heavy global refresh work belongs inside that foreground path.

### 3.2 Background is opportunistic

Background work is allowed only when:

- no foreground work is available
- memory and system pressure are acceptable
- a bounded background budget remains

Background work must never delay a ready foreground planner job.

### 3.3 Truthful operator state

The runtime must expose:

- what it is doing now
- why it is not doing queue work if it is not
- how long the current action has been running
- whether the machine is degraded by memory pressure

### 3.4 Bounded degradation

When the machine is constrained, the system must do less work explicitly and safely.

It must not:

- pretend to be healthy while starving the queue
- mix multiple execution purposes into one vague loop
- keep optional work alive when memory pressure is critical

## 4. Target Runtime Topology

The hardened runtime keeps the existing 3-process split, but changes responsibilities.

### 4.1 Guardian

`guardian` remains:

- watchdog
- restart owner
- resource monitor
- liveness and stuck-work supervisor

Guardian must not mutate planner business state beyond restart and recovery signaling.

### 4.2 Foreground worker

`sync` becomes a strict foreground queue executor.

Its only mutating responsibilities are:

- process bounded system commands required for worker control
- recover stale `RUNNING` jobs
- claim exactly one runnable queue job
- execute exactly that job
- persist truthful progress and heartbeat

It must not:

- run full queue sync every cycle
- run snapshot refresh inline
- run broad global maintenance inline

### 4.3 Background worker

A new bounded background lane should be introduced as a separate process:

- `snapshot-worker`

Responsibilities:

- bounded intelligence snapshot refresh
- slow global read-model rebuilds
- non-urgent observability aggregation
- optional analytics history compaction

The background worker must be:

- independently restartable
- suppressible under low memory
- unable to claim foreground planner jobs

### 4.4 Status server

`status-server` remains read-only for business state.

It should aggregate:

- foreground worker truth
- guardian truth
- background worker truth
- queue summary truth

The status server must not infer activity that the worker has not explicitly claimed.

## 5. Canonical Foreground Worker State Machine

The foreground worker must use explicit states.

### 5.1 States

- `BOOTING`
- `RECOVERING_STALE_WORK`
- `PROCESSING_SYSTEM_COMMANDS`
- `CLAIMING_NEXT_JOB`
- `EXECUTING_JOB`
- `IDLE_NO_RUNNABLE_JOB`
- `PAUSED_LOW_MEMORY`
- `ERROR`

### 5.2 Progress contract

For every state, persist:

- `state`
- `stage`
- `activeTask`
- `currentCompany`
- `currentJobId`
- `currentJobType`
- `jobStartedAt`
- `lastProgressAt`
- `lowMemoryMode`
- `resourceBand`

### 5.3 Current company rule

`currentCompany` may be non-null only when:

- a foreground job has been claimed and is executing for that company

It must be null during:

- queue scan
- stale recovery
- idle
- global background work

## 6. Queue Execution Contract

### 6.1 One claim only

The foreground worker must claim exactly one job per cycle.

Contract:

- `runPipelineQueueBatch(prisma, 1)` remains the only legal claim count for foreground execution
- any future parallelism must require a deliberate separate runtime design

### 6.2 No full queue sync in hot path

`syncAllCompanyPipelineJobs(prisma)` must not run before every claim.

Target design:

- foreground loop only syncs:
  - the company of the claimed job
  - or a bounded stale-company subset when no job is claimed
- full queue sync moves to:
  - background worker
  - or a slower bounded repair interval

### 6.3 Incremental sync policy

Target queue sync policy:

- on worker boot:
  - run one bounded queue repair pass
- on each foreground cycle:
  - recover stale `RUNNING`
  - claim next runnable job
  - after completion, sync only the touched company if required
- on idle cycles:
  - sync one additional company shard
- on slower timer:
  - perform bounded global queue hygiene

### 6.4 Job heartbeat

Each `RUNNING` job must heartbeat:

- worker progress
- `pipelineJob.updatedAt`
- `pipelineJob.lastHeartbeatAt` once added to schema

Heartbeat interval target:

- every `30s`

## 7. Background Work Isolation

### 7.1 Snapshot refresh

`SNAPSHOT_REFRESH` must move out of the foreground worker.

Target behavior:

- snapshot work runs only in `snapshot-worker`
- snapshot work is bounded by company batch size and wall-clock budget
- snapshot work pauses automatically when queue backlog or low-memory thresholds demand it

### 7.2 Other background families

Background-only families:

- intelligence snapshots
- global inventory history rollups
- optional analytics compaction
- slow diagnostic summarization

Foreground-only families:

- planner minimums
- quality opportunity mining
- feedback reconciliation
- rescoring
- score alert repair
- workflow execution

### 7.3 Arbitration rule

Foreground wins over background every time.

If any runnable foreground job exists:

- background worker must stand down

## 8. Resource Guardrails

The runtime needs explicit resource bands, not just warnings.

### 8.1 Memory bands

- `HEALTHY`
  - free memory `>= 1500 MB`
- `CONSTRAINED`
  - free memory `1000-1499 MB`
- `DEGRADED`
  - free memory `600-999 MB`
- `CRITICAL`
  - free memory `< 600 MB`

### 8.2 Allowed work by memory band

`HEALTHY`

- all foreground jobs allowed
- background worker allowed
- opportunity mining allowed
- maintenance allowed

`CONSTRAINED`

- all foreground jobs allowed
- background snapshot worker paused
- maintenance throttled
- opportunity mining throttled

`DEGRADED`

- only critical and normal planner foreground jobs allowed
- optional mining disabled
- maintenance disabled except explicit repair or human escalation
- snapshot worker disabled

`CRITICAL`

- no new model-heavy work unless explicitly human-forced or safety-critical
- only stale recovery, queue repair, and minimal reconciliation allowed
- worker advertises `PAUSED_LOW_MEMORY`

### 8.3 Resource sources

Resource truth should come from:

- guardian process measurements
- persisted heartbeat payload
- foreground worker progress payload

The status server must not invent its own resource interpretation.

## 9. Job Runtime Budgets

Each job family needs a hard wall-clock budget.

Initial target budgets:

- `CARD_RESCORING`: `10 min`
- `FEEDBACK_RECONCILIATION`: `10 min`
- `SCORE_ALERT_REPAIR`: `15 min`
- `ENSURE_FLASHCARD_MINIMUM`: `15 min`
- `ENSURE_IDEABANK_MINIMUM`: `15 min`
- `ENSURE_ROADMAP_MINIMUM`: `15 min`
- `ENSURE_BACKLOG_MINIMUM`: `15 min`
- `ENSURE_TODO_MINIMUM`: `15 min`
- `ENSURE_CHECKLIST_MINIMUM`: `15 min`
- `MINE_FLASHCARD_OPPORTUNITIES`: `10 min`
- `MINE_TASK_OPPORTUNITIES`: `10 min`
- `REFRESH_FLASHCARDS`: `10 min`
- `REFRESH_TASKS`: `10 min`
- `REFRESH_DATACARDS`: `10 min`
- `REFRESH_GOALS`: `10 min`
- `WORKFLOW_BLUEPRINT`: `15 min`

When budget is exceeded:

1. heartbeat one final time
2. mark the job failed with timeout reason
3. record timeout telemetry
4. release the lane for the next cycle

## 10. Stale Work Recovery

### 10.1 Stale `RUNNING` rule

A job is stale when:

- status is `RUNNING`
- heartbeat age exceeds job-family budget
- no worker process truth matches the claimed job

### 10.2 Recovery action

Recovery must:

- mark the stale job `FAILED` or `ACTIVE` according to retry policy
- attach machine-readable recovery reason
- increment stale-recovery telemetry

### 10.3 Retry policy

Retry policy should be explicit per family:

- recoverable model timeout -> requeue
- invalid persistence payload -> fail and surface defect
- repeated stale recovery beyond threshold -> park and escalate

## 11. System Commands

System commands must stay bounded and control-only.

Allowed foreground system commands:

- `RESTART`
- `PURGE_CACHE`
- `FORCE_RUN`
- `RECOVER_STALE_RUNNING`

System commands must not become a shadow planner path.

They should only:

- affect runtime control
- trigger bounded repair
- request worker wake-up

## 12. Observability Contract

The operator dashboard must make execution state obvious.

### 12.1 Required fields

- foreground worker state
- foreground current company
- foreground current task
- foreground current job id
- foreground current job type
- foreground elapsed time
- foreground last heartbeat age
- background worker state
- background current action
- queue depth
- queue runnable depth
- queue failed depth
- memory band
- free memory MB
- build identity
- `matchesOriginMain`
- `gitDirty`

### 12.2 Required explanations

If no foreground job is running, the dashboard must say why:

- no runnable jobs
- recovering stale work
- processing system commands
- paused due to low memory
- runtime error

### 12.3 Operator trust rule

The dashboard must never label a queue item as current execution unless the worker has actually claimed it.

## 13. Data Model Additions

Recommended additions:

### 13.1 `PipelineJob`

Add:

- `lastHeartbeatAt`
- `runtimeBudgetMs`
- `stallCount`
- `lastRecoveredAt`
- `lastRecoveryReason`

### 13.2 Runtime heartbeat record

Persist or enrich worker heartbeat with:

- `role`
  - `foreground`
  - `background`
- `resourceBand`
- `currentJobId`
- `jobStartedAt`
- `memoryPressurePause`

### 13.3 Snapshot metadata

Snapshot background worker metadata:

- `lastSliceStartedAt`
- `lastSliceCompletedAt`
- `lastSliceCompanyCount`
- `lastSkippedReason`

## 14. Module Boundaries

Recommended new modules:

- `scripts/lib/runtime/foreground-loop.js`
- `scripts/lib/runtime/background-snapshot-loop.js`
- `scripts/lib/runtime/resource-bands.js`
- `scripts/lib/runtime/job-budgets.js`
- `scripts/lib/runtime/stale-recovery.js`
- `scripts/lib/runtime/queue-sync-policy.js`
- `scripts/lib/runtime/runtime-progress.js`

Recommended responsibility changes:

- `scripts/sync.js`
  - becomes thin bootstrap for foreground loop
- `scripts/status-server.js`
  - becomes read-only aggregator of runtime truth
- `scripts/guardian.js`
  - keeps watchdog and resource supervision only

## 15. Implementation Plan

### Phase 1. Foreground lane hardening

Goal:

- make the current single worker behave truly linearly

Changes:

- extract foreground loop from `scripts/sync.js`
- remove inline snapshot refresh from foreground loop
- keep one-job claim only
- add explicit `CLAIMING_NEXT_JOB` and `EXECUTING_JOB` progress states
- add per-job heartbeat age and elapsed runtime

Acceptance:

- one and only one foreground job may be `RUNNING`
- dashboard always shows real current job or explicit idle reason
- no snapshot refresh appears in the foreground lane

### Phase 2. Queue sync decoupling

Goal:

- stop paying full sync cost on every claim attempt

Changes:

- remove `syncAllCompanyPipelineJobs(prisma)` from `claimNextPipelineJobs`
- move full sync to bounded maintenance path
- sync only touched companies on productive cycles
- add slow-timer shard sync for idle periods

Acceptance:

- foreground claim path no longer performs global sync every cycle
- queue claim latency drops measurably under backlog

### Phase 3. Background snapshot worker

Goal:

- isolate observability snapshot work from planner throughput

Changes:

- add `snapshot-worker`
- move `refreshIntelligenceSnapshotSlice` ownership there
- add background worker heartbeat
- make guardian supervise foreground and background separately

Acceptance:

- queue backlog can progress while snapshot refresh happens independently
- pausing background work never pauses the foreground worker

### Phase 4. Resource-band enforcement

Goal:

- degrade deliberately under memory pressure

Changes:

- implement `resource-bands.js`
- enforce allowed-work matrix by band
- surface band in status server and dashboard

Acceptance:

- low-memory conditions change runtime behavior predictably
- optional work stops before the worker collapses

### Phase 5. Budgeted stale recovery

Goal:

- prevent long silent stalls

Changes:

- add `runtimeBudgetMs` by job family
- add stale-recovery module
- add timeout telemetry
- add park/escalate rules for repeatedly stale jobs

Acceptance:

- no job can sit `RUNNING` indefinitely without recovery
- operator can see timeout and recovery reasons

### Phase 6. Operator truth and tests

Goal:

- make `/local-ai` a fully trustworthy control surface

Changes:

- render explicit foreground/background split
- show elapsed current-job runtime
- show last heartbeat age
- show pause reason when no job is running
- add regression tests for:
  - one-running-job invariant
  - foreground/background isolation
  - low-memory pause
  - stale-job reclaim
  - no current-company leakage during queue scan

Acceptance:

- dashboard state always matches worker truth
- runtime hardening scenarios are covered by automated tests

## 16. Rollout Order

Safe rollout order:

1. ship foreground progress-state and heartbeat improvements
2. remove hot-path full queue sync
3. ship background snapshot worker dark
4. enable memory-band gating
5. enable timeout and stale-recovery budgets
6. promote dashboard truth changes

Do not:

- introduce background worker before foreground truth is fixed
- enable memory gating without explicit dashboard visibility
- keep both old inline snapshot refresh and new background snapshot worker active together

## 17. Success Criteria

The hardening work is complete only when these statements are true:

- one foreground job executes at a time
- snapshot refresh cannot starve planner work
- low memory causes explicit degraded behavior instead of vague slowness
- stale `RUNNING` work is reclaimed predictably
- `/local-ai` explains exactly why the worker is or is not moving
- operator trust no longer depends on reading guardian logs by hand

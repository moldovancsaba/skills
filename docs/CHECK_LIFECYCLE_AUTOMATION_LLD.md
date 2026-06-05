# CHECK Lifecycle Automation LLD

This document defines the production contract for the lifecycle automation slice covering provisioning, maintenance, destination daemon scheduling, Visitor content maintenance, and feedback learning.

It follows the quality structure required by sovereignsquad/general-design-system#81.

## Scope

- #353 Provisioning engine
- #354 Maintenance engine
- #355 Destination mission daemon
- #356 Visitor existing content maintenance
- #357 Feedback learning loop

## Architecture

Lifecycle automation is split into two layers:

- Pure contract layer: `src/lib/check-lifecycle/lifecycle-spine.js`
- Database/runtime layer: existing provisioning, maintenance, queue, daemon, and Visitor modules

The pure layer is deterministic and database-free. Runtime code consumes it to keep repair behavior predictable and testable.

## Runtime flow

Provisioning:

1. Build a provisioning plan from Unit profile and destination keys.
2. Create or verify the Unit.
3. Ensure required pipeline jobs.
4. Ensure destination instances.
5. Ensure active mission definitions.
6. Mark topology/projections dirty.
7. Record audit event or compensating audit event on rollback.

Maintenance:

1. Select a bounded Unit shard.
2. Infer active destination keys.
3. Compare actual jobs, missions, daemon lanes, public projections, and memory state against topology requirements.
4. Apply safe repairs inline.
5. Queue heavy repairs such as public verification.
6. Return `lifecycleHealth`, `daemonLane`, and `telemetry`.

Destination daemon:

1. Resolve mission kinds through lifecycle topology.
2. Use one destination-agnostic daemon identity: `DESTINATION_MISSION_DAEMON` / `DESTINATION_SERVICE` / `destination-service`.
3. Store lane metadata with `destinationKeys`, `missionKinds`, `activeDefinitionIds`, `activeRunIds`, and `serviceLane`.
4. Keep ClassScout `rulebook_new_listing` and Compare `VISITOR_CONTENT_CURATION` in the same scheduling contract.

Visitor content maintenance:

1. Score source trust, freshness, taxonomy fit, evidence completeness, and feedback fit.
2. Apply hard blocks before any publish decision.
3. Block source-only, missing-source-evidence, forbidden-category, and fake/placeholder content.
4. Queue review, verification, retirement, or publish based on deterministic state.

Feedback learning:

1. Normalize operator feedback into rules.
2. Apply severity precedence: `block > retire > require_review > warn`.
3. Attach rules to candidate review and existing content maintenance.
4. Trigger refinement when rules affect future or already published content.

## Contracts

### Provisioning plan

`buildProvisioningPlan(input)` returns:

- `schemaVersion`
- `type`
- `destinationKeys`
- `requirements`
- `steps`
- `created`
- `repaired`
- `skipped`
- `failed`

Every step includes:

- `id`
- `operation`
- `status`
- `retryable`
- `rollback`
- `summary`
- `metadata`

### Maintenance diff

`buildMaintenanceDiff(input)` returns:

- `state`: `healthy`, `repairing`, `blocked`, or `paused_low_memory`
- `reasonCode`
- `operatorMessage`
- `safeRepairs`
- `heavyRepairs`
- `failures`
- `metrics`

Reason codes include:

- `missing_pipeline_job`
- `missing_daemon_lane`
- `missing_mission_definition`
- `stale_mission_kind`
- `stale_public_projection`
- `paused_low_memory`

### Daemon lane metadata

`buildDestinationDaemonLane(input)` returns:

- `jobType`
- `entityType`
- `entityId`
- `metadata.destinationKeys`
- `metadata.missionKinds`
- `metadata.activeDefinitionIds`
- `metadata.activeRunIds`
- `metadata.serviceLane`
- `metadata.sourceSignal`

### Visitor content health

`scoreVisitorContentHealth(input)` returns:

- `score`
- `state`
- `publishEligible`
- `hardBlocks`
- `recoveryAction`

The score is:

`S = 0.35*sourceTrust + 0.25*freshness + 0.20*taxonomyFit + 0.15*evidenceCompleteness + 0.05*feedbackFit`

Any hard block forces `S = 0` and `publishEligible = false`.

### Feedback policy

`normalizeVisitorFeedbackDecision(decision)` creates durable rule payloads.

`evaluateVisitorFeedbackPolicy({ candidate, rules })` returns:

- `decision`
- `severity`
- `matchedRules`
- `publishEligible`
- `refinementRequired`

## APIs

Existing public/internal APIs stay in place for this slice.

Runtime services should expose the new lifecycle payloads where available:

- `POST /api/companies`
- `POST /api/companies/[companyId]/capabilities/transaction`
- lifecycle maintenance CLI and worker output
- destination mission daemon responses
- Visitor ops snapshots
- Visitor feedback/review routes

## UX states

Operator-facing states:

- loading
- healthy
- repairing
- degraded
- blocked
- paused low memory
- retrying
- repaired
- failed terminal

No UI was introduced in this slice. Future UI work must use only the Sovereign Squad General Design System and must expose semantic status regions, keyboard access, visible focus, accessible error text, and reduced-motion-safe transitions.

## Observability

Lifecycle telemetry payload:

- `event`
- `schemaVersion`
- `unitId`
- `companyId`
- `destinationKeys`
- `reasonCode`
- `retryable`
- `recovered`
- `metrics`

Required events:

- `LIFECYCLE_PROVISIONING_PLAN`
- `LIFECYCLE_MAINTENANCE_RUN`
- `DESTINATION_DAEMON_LANE_SYNC`
- `VISITOR_CONTENT_HEALTH_EVALUATED`
- `VISITOR_FEEDBACK_POLICY_APPLIED`

## Retries and timeouts

- Provisioning steps are retryable unless marked terminal.
- Maintenance repairs are idempotent.
- Heavy repairs must be queued, not executed inline.
- Low-memory maintenance must pause visibly as `paused_low_memory`.
- Destination daemon processing remains bounded by existing run/pass/retry limits.

## Rollback and recovery

- Failed provisioning reruns use the same idempotency key where available.
- Pipeline topology rollback is `mark topology dirty + rerun sync`.
- Destination rollback is deactivate destination or pause/archive mission definition.
- Visitor content rollback is retire/unpublish and rerun public verification.
- Feedback rollback is a compensating rule or rule disablement; policy-changing actions must remain audited.

## Edge cases

- Duplicate Unit provisioning request.
- Existing destination with stale config.
- Missing pipeline job.
- Missing daemon lane.
- Compare mission using legacy ClassScout policy.
- Low local memory.
- Source-only record attempting to publish as listing.
- Fake/test/placeholder public content.
- Conflicting feedback rules.
- Over-broad category ban.

## Testing

Primary contract harness:

```bash
npm run test:lifecycle-automation-spine
```

Related harness:

```bash
npm run test:lifecycle-topology
```

Production build gate:

```bash
npm run build
```

## Operational commands

Run lifecycle maintenance:

```bash
npm run maintenance:lifecycle
```

Verify lifecycle health:

```bash
npm run verify:lifecycle
```

Run lifecycle migration/backfill dry-run:

```bash
npm run migration:lifecycle
```

Apply lifecycle migration/backfill repairs:

```bash
npm run migration:lifecycle:apply
```

Run downstream delivery gates:

```bash
npm run test:lifecycle-delivery-gates
```

## Public verification and rollback gate

`buildPublicVerificationProof(input)` is the canonical proof contract for Visitor public output.

It returns:

- `state`: `pending`, `verified`, `drift_detected`, `rollback_pending`, `rolled_back`, or `blocked`
- `readModelFresh`
- `publicAvailable`
- `comparedItemCount`
- `failedItemCount`
- `rollbackActionCount`
- `comparisons`
- `rollbackActions`
- `reasonCodes`
- `operatorMessage`

Critical failures produce rollback actions:

- fake or placeholder public content
- forbidden category
- missing source evidence
- public item missing Local proof

Non-critical drift queues projection refresh:

- missing public item
- stale public item
- wrong category without a hard policy block

## Lifecycle control center view model

`buildLifecycleControlCenterView(input)` is the API-to-UI contract for the GDS lifecycle control center.

It provides:

- Unit summary for Blocks, Modules, and Miniapps
- daemon lane card
- maintenance card
- public verification card
- recovery actions card
- mandatory UX states
- accessibility requirements

Mandatory UX states:

- loading
- empty
- healthy
- running
- degraded
- failed
- disabled
- permission-denied

The Observability page renders this as `Lifecycle Control Center` using existing app UI primitives and a polite live region.

## Migration/backfill report

`buildLifecycleMigrationReport(input)` and `scripts/lifecycle-migration-backfill.mjs` provide idempotent migration reporting.

Report statuses:

- `would_create`
- `created`
- `repaired`
- `quarantined`
- `blocked`
- `skipped`

Dry-run is the default. Apply mode uses existing lifecycle maintenance execution and still writes a machine-readable report under `logs/lifecycle-migration`.

Fake/test content is quarantined, not republished.

## Lifecycle release gates

`buildLifecycleVerificationReport(input)` is the pure invariant gate used by `verify:lifecycle`.

Stable check ids:

- `active-unit-has-core-jobs`
- `active-destination-has-daemon`
- `mission-kind-schedulable`
- `public-content-source-backed`

Every failed check includes:

- `expected`
- `actual`
- `remediation`

## Unit recovery center contract

Operations items expose `recoveryActionView`.

Each action view includes:

- `safeActions`
- `confirmationRequired`
- `idempotencyRequired`
- `auditRequired`
- `permissionRequired`
- `operatorMessage`

Mutation endpoints remain:

- `POST /api/companies/[companyId]/operations/[itemId]/retry`
- `POST /api/companies/[companyId]/operations/[itemId]/cancel`
- `POST /api/companies/[companyId]/operations/[itemId]/replay`
- `POST /api/companies/[companyId]/operations/[itemId]/rollback`
- `POST /api/companies/[companyId]/operations/[itemId]/acknowledge`

All mutations are permission guarded and audit recorded.

## Known limitations

- The pure spine is a contract layer; database-specific repair execution still lives in the existing provisioning, maintenance, queue, daemon, and Visitor modules.
- Future UI issues must render these states through GDS-only surfaces.
- Migration/backfill for historical data remains a downstream lifecycle issue.

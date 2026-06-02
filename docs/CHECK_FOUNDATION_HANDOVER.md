# check Foundation Handover

This is the implementation handover for the `check` foundation.

Purpose:

- keep naming stable
- keep Unit/Block/Module/Card/Miniapp boundaries explicit
- keep delivery predictable as new Blocks and Miniapps are added

## 1. Canonical Product Language

Use these terms in product, docs, issues, and API naming:

- `check`: full platform
- `Unit`: tenant/workspace scope
- `Block`: optional product capability bundle enabled per Unit
- `Module`: runtime subsystem required by one or more Blocks
- `Card`: owned work/data object type
- `Miniapp`: Miniapp powered by Unit intelligence
- `Webapp`: B2B operator UI
- `Local`: local AI/background execution services

Legacy aliases are implementation-only compatibility language:

- `company` means `Unit`
- `webappProfile` and legacy `modules` payloads are compatibility adapters only
- old route wording must not be used as preferred architecture language

## 2. Mandatory UI Rule

All Webapp UI/UX/frontend implementation must use only:

- local checkout: `/Users/Shared/Projects/general-design-system`
- upstream: `sovereignsquad/general-design-system`

Accessibility is mandatory:

- keyboard navigation
- visible focus
- semantic structure and labels
- screen-reader compatibility
- non-color-only state
- contrast and reduced-motion support where applicable

## 3. Foundation Boundaries

Architecture boundary:

```text
check
  -> Unit
  -> optional Blocks
  -> required Modules
  -> owned Cards
  -> Webapp operational UI
  -> Local background execution
  -> optional Miniapps as public services
```

Rules:

- Blocks are optional per Unit
- Modules are required by enabled Blocks
- Card ownership is explicit by Block/Module contract
- Project Block runtime is isolated from other business logic
- Miniapp business rules are isolated behind Miniapp adapters

## 4. Canonical Contract Map (Implemented)

- Unit capability v3:
  - [src/lib/check-foundation/capabilities-v3.ts](/Users/Shared/Projects/checklist/src/lib/check-foundation/capabilities-v3.ts)
- Block and Module definitions:
  - [src/lib/check-foundation/registry-data.json](/Users/Shared/Projects/checklist/src/lib/check-foundation/registry-data.json)
  - [src/lib/check-foundation/registry.ts](/Users/Shared/Projects/checklist/src/lib/check-foundation/registry.ts)
- Card definitions:
  - [src/lib/check-foundation/card-registry-data.json](/Users/Shared/Projects/checklist/src/lib/check-foundation/card-registry-data.json)
  - [src/lib/check-foundation/card-registry.ts](/Users/Shared/Projects/checklist/src/lib/check-foundation/card-registry.ts)
- Miniapp definitions and adapters:
  - [src/lib/check-foundation/miniapp-registry-data.json](/Users/Shared/Projects/checklist/src/lib/check-foundation/miniapp-registry-data.json)
  - [src/lib/check-foundation/miniapp-registry.ts](/Users/Shared/Projects/checklist/src/lib/check-foundation/miniapp-registry.ts)
- Compare quality and eligibility scoring:
  - [src/lib/destination-compare-quality.ts](/Users/Shared/Projects/checklist/src/lib/destination-compare-quality.ts)
- Unit package matrix:
  - [src/lib/check-foundation/unit-packages-data.json](/Users/Shared/Projects/checklist/src/lib/check-foundation/unit-packages-data.json)
  - [src/lib/check-foundation/unit-packages.ts](/Users/Shared/Projects/checklist/src/lib/check-foundation/unit-packages.ts)
- Local job attribution:
  - [src/lib/local-job-attribution.js](/Users/Shared/Projects/checklist/src/lib/local-job-attribution.js)
- Block projection summary:
  - [src/app/api/companies/[companyId]/blocks/summary/route.ts](/Users/Shared/Projects/checklist/src/app/api/companies/[companyId]/blocks/summary/route.ts)

## 5. Canonical API Families

Unit capability and packaging APIs:

- [src/app/api/companies/[companyId]/settings/route.ts](/Users/Shared/Projects/checklist/src/app/api/companies/[companyId]/settings/route.ts)
- [src/app/api/companies/[companyId]/package/route.ts](/Users/Shared/Projects/checklist/src/app/api/companies/[companyId]/package/route.ts)

Block summary and operations APIs:

- [src/app/api/companies/[companyId]/blocks/summary/route.ts](/Users/Shared/Projects/checklist/src/app/api/companies/[companyId]/blocks/summary/route.ts)
- [src/app/api/companies/[companyId]/operations/route.ts](/Users/Shared/Projects/checklist/src/app/api/companies/[companyId]/operations/route.ts)

Project Block APIs:

- board runtime uses shared board mechanisms with isolated Project Block mappings
- key isolation surface:
  - [src/lib/board-adapters.ts](/Users/Shared/Projects/checklist/src/lib/board-adapters.ts)

Miniapp canonical workflow APIs:

- [src/app/api/units/[unitId]/miniapps/[miniappId]/missions/route.ts](/Users/Shared/Projects/checklist/src/app/api/units/[unitId]/miniapps/[miniappId]/missions/route.ts)
- [src/app/api/units/[unitId]/miniapps/[miniappId]/candidates/route.ts](/Users/Shared/Projects/checklist/src/app/api/units/[unitId]/miniapps/[miniappId]/candidates/route.ts)
- [src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/approve/route.ts](/Users/Shared/Projects/checklist/src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/approve/route.ts)
- [src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/publish/route.ts](/Users/Shared/Projects/checklist/src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/publish/route.ts)
- [src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts](/Users/Shared/Projects/checklist/src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts)

ClassScout and Compare landing APIs:

- [src/app/api/classscout/landing-summary/route.ts](/Users/Shared/Projects/checklist/src/app/api/classscout/landing-summary/route.ts)
- [src/app/api/compare/landing-summary/route.ts](/Users/Shared/Projects/checklist/src/app/api/compare/landing-summary/route.ts)

## 6. API Ownership, Permissions, Retry, Rollback

Owner model:

- Webapp routes own user intent capture and permission gates
- Local owns long-running execution and retries
- Miniapp adapters own public destination publish integration

Permission model:

- membership verification is mandatory on unit-scoped APIs
- canonical miniapp APIs use:
  - `miniapp.card.approve`
  - `miniapp.card.publish`

Retry/timeout behavior:

- publish adapters return `failed` vs `retryable_failed`
- Local queue statuses distinguish `running`, `retrying`, `failed`, `dead_lettered`
- operations API exposes retry pressure for operators

Rollback/recovery behavior:

- keep failed review cards in review/publish visibility
- use replay and refresh flows instead of destructive resets
- record outcome/audit events for permission, publish, and review decisions

## 7. Runtime Flow

Canonical miniapp flow:

```text
mission start
  -> candidate generation
  -> review card creation
  -> human approve/reject/rework
  -> publish via miniapp adapter
  -> outcome recording
  -> refresh mission (when needed)
```

Daemon default policy rule:

- Local destination daemon uses the same guarded/autopilot execution defaults across `classscout`, `compare`, and future miniapps in this family.
- New miniapps should plug into the shared destination adapter and mission runtime, not receive custom daemon forks.
- Pipeline queue destination-lane activation must evaluate active mission definitions/runs generically, not by hardcoded single-miniapp assumptions.
- Destination maintenance reporting is per-destination; if a miniapp does not yet have specialized maintenance hooks, daemon output must declare that explicitly.

Operational visibility surfaces:

- Unit operations feed (`/api/companies/{companyId}/operations`)
- Block summary feed (`/api/companies/{companyId}/blocks/summary`)
- Miniapp landing summaries (ClassScout and Compare)

## 8. User-Visible Webapp States

Minimum documented states:

- Block disabled
- Block setup required
- Block ready
- Block degraded/partial data
- stale read model warning
- Local job failed/retrying/dead-letter
- Miniapp bridge missing
- Miniapp publish pressure

## 9. Verification Commands

Contract-level checks:

```bash
npm run audit:terminology
npm run test:check-foundation-registry
npm run test:check-foundation-cards
npm run test:check-foundation-miniapps
npm run test:check-foundation-packages
```

Golden-path checks:

```bash
npm run verify:classscout-golden-path -- --companyId <companyId> [--strict]
npm run verify:compare-golden-path -- --companyId <companyId> [--strict]
```

Foundation harness:

```bash
npm run verify:check-foundation
npm run verify:check-foundation -- --block project
npm run verify:check-foundation -- --miniapp compare --companyId <companyId>
```

## 10. Rollout Order (Execution Sequence)

Delivery should follow this order:

1. terminology guard
2. registry and capability contracts
3. route and board isolation hardening
4. local attribution and operations visibility
5. miniapp registry/adapter parity
6. canonical miniapp API contract surface
7. verification harness
8. final docs and issue quality guard updates

## 11. Edge Cases That Must Stay Covered

- Unit with only Sales
- Unit with only Project
- Unit with only Miniapp
- disabled Miniapp Ops workspace route access
- Local job attributed to wrong miniapp
- adapter unavailable
- publish failure with retry path
- stale projection while routes remain available

## 12. Security and Privacy Baseline

- never log adapter secrets
- keep all miniapp endpoints unit-scoped and membership-protected
- enforce explicit publish/approve permissions
- treat operator notes and correction payloads as sensitive operational data

## 13. Future Issue-Writing Rule

Use the canonical quality/structure pattern from issue #81 as the template baseline.

Every new issue must define:

- architecture
- runtime flow
- contracts/APIs
- pseudo-code or decision logic
- UX states
- accessibility expectations
- observability/retries/timeouts
- rollback/recovery path
- tests
- documentation updates
- dependency mapping and execution order

Required board/doc governance artifacts:

- [docs/PROJECT_BOARD_GOVERNANCE.md](/Users/Shared/Projects/checklist/docs/PROJECT_BOARD_GOVERNANCE.md)

No umbrella or vague tickets.

## 14. Known Current Limitations

- Some mission/extractor runtime internals remain classscout-first and are being pulled into stricter multi-miniapp parity incrementally.
- Legacy payload aliases (`webappProfile`, legacy module keys) still exist for compatibility and should be removed only after migration/backfill is complete.

## Destination daemon policy operator guide

This guide is mandatory for Unit operators tuning ClassScout and Compare mission automation.

### Policy source of truth

- per-Unit daemon policy is stored in `company.workerConfig.destinationDaemonPolicy`
- policy shape:
  - `defaults`
  - `miniapps.classscout`
  - `miniapps.compare`

### Runtime precedence

The daemon always resolves limits in this fixed order:

1. explicit daemon API override (`/api/destination-missions/daemon` request body)
2. Unit miniapp policy (`workerConfig.destinationDaemonPolicy.miniapps.<destinationKey>`)
3. shared environment defaults (`DESTINATION_MISSION_DAEMON_*` + maintenance defaults)

### Limits and bounded ranges

- `maxRuns`: 1..20
- `maxPasses`: 1..8
- `maxAutoRejections`: 1..10
- `maxRevisionIntakes`: 1..20
- `maxApprovedPublishes`: 1..20

All values are clamped to safe bounds at API and runtime layers.

### Tuning playbook

Use this order when tuning a Unit:

1. start from shared defaults
2. change one destination lane at a time (`classscout` or `compare`)
3. increase `maxRuns` only when queue pressure is sustained
4. increase `maxPasses` only when candidates frequently stop before review-ready
5. increase `maxAutoRejections` carefully; high values can hide quality drift
6. increase maintenance limits only when approved review-card backlog or stale review pressure is visible
7. keep overrides minimal; avoid diverging both lanes unless behavior differs materially

### Operational checks

After policy changes, monitor:

- `/api/companies/[companyId]/operations`
  - `destinationDaemon.byDestination[].status`
  - `destinationDaemon.byDestination[].failedRecoverableCount`
  - `destinationDaemon.byDestination[].pausedCount`
- daemon execution response `policy.effectiveByDestination`
- maintenance response `maintenance.byDestination`

### Rollback and recovery

If throughput or quality regresses:

1. reset the edited lane to defaults from the settings UI
2. re-run daemon with no explicit overrides
3. verify recoverable failures are draining and review pressure returns to baseline

### Governance constraints

- do not create Miniapp-specific daemon forks for scheduling or policy logic
- implement Miniapp-specific maintenance behavior only via destination maintenance adapters
- new Miniapps must inherit this same policy model by default

## Operations recovery action endpoints

Implemented mutation routes for operational recovery actions:

- `POST /api/companies/[companyId]/operations/[itemId]/retry`
- `POST /api/companies/[companyId]/operations/[itemId]/cancel`
- `POST /api/companies/[companyId]/operations/[itemId]/replay`
- `POST /api/companies/[companyId]/operations/[itemId]/rollback`
- `POST /api/companies/[companyId]/operations/[itemId]/acknowledge`

Behavior summary:

- Local job items (`local-job:*`) perform guarded pipeline job state transitions with permission and audit logging.
- Miniapp publish-pressure items (`miniapp-publish:*`) trigger command-queued daemon recovery (`ESCALATE_PIPELINE_JOB`, `SYNC_PIPELINE_JOBS`, `REFRESH_INTELLIGENCE_SNAPSHOTS`).
- Read-model stale item (`read-model:projection-stale`) triggers projection refresh command.
- Every action is permission-gated and audited through the Unit permissions/audit contract.

## Destination key resolution defaults

To keep destination workflows consistent across enabled Miniapps within a Unit, API routing now resolves destination scope in this order for read routes:

1. explicit `destinationKey` request parameter (if valid)
2. most recently updated active destination instance on the Unit
3. static fallback `classscout` when no active destination exists yet

Write routes for mission definitions and mission runs now reject invalid destination keys with `400` instead of silently coercing to `classscout`.

Updated endpoints:

- `GET /api/destination-learning/summary`
- `GET /api/destination-learning/replay-candidates`
- `GET /api/destination-missions/definitions`
- `POST /api/destination-missions/definitions`
- `GET /api/destination-missions/runs`
- `POST /api/destination-missions/runs`

## Destination workspace scope controls

The destination content-ops workspace now accepts a query-level destination scope:

- `destinationKey=classscout`
- `destinationKey=compare`

Current UI propagation is wired for mission runner and learning panel in `review` workspace mission tab, and the page header label mirrors the selected destination.

## Destination-aware mission setup and runner

The review workspace now forwards destination scope into core mission controls:

- `DestinationMissionSetup` accepts `destinationKey` and sends it on mission definition and mission run mutations.
- `DestinationRulebookRunner` accepts `destinationKey` and uses it for run listing and run start operations.
- `DestinationLearningPanel` accepts optional `destinationKey`; if omitted, APIs resolve destination from active Unit configuration.
- Human-facing text in destination review/live-listing surfaces was normalized to avoid ClassScout-only wording where behavior is shared.

## Destination capability gating in review workspace

The `ops` tab in destination content ops is now capability-gated:

- shown only when destination scope is `classscout` (current live-listing bridge support)
- automatically falls back to `setup` when `tab=ops` is requested for destinations without live-listing support

This prevents cross-destination UI drift where a destination lane exposes controls not backed by adapter/runtime capability.

## Company navigation destination counters

`GET /api/companies/:companyId/nav` now emits attention counters for both supported Miniapps:

- `counts.classscout`
- `counts.compare`

Both counters use the same review-card pressure criteria (`AWAITING_REVIEW`, `APPROVED`, `REWORK_REQUESTED`) scoped per destination instance.

## Miniapp Ops workspace route fallback normalization

Fallback Miniapp Ops workspace route selection in package/summary contracts now prefers:

1. `classscout` when enabled
2. `compare` when enabled
3. first enabled miniapp key for forward-compatibility
4. legacy `/classscout` fallback when no miniapp key exists yet

This prevents future destination keys from being forced through a ClassScout-only URL assumption.

## Shared mission defaults naming

Destination mission contract defaults were normalized to shared names:

- `DEFAULT_DESTINATION_RULEBOOK_POLICY`
- `DEFAULT_DESTINATION_MISSION_DEFINITION`

Backward-compatible aliases are kept:

- `DEFAULT_CLASSSCOUT_RULEBOOK_POLICY`
- `DEFAULT_CLASSSCOUT_MISSION_DEFINITION`

This preserves runtime compatibility while removing ClassScout-only naming at the shared contract layer.

## Destination landing and review default scope

Miniapp landing scope now follows enabled miniapp order when available:

- `GET /:companyId` home route resolves first supported miniapp key from `enabledMiniapps` (`classscout` or `compare`) and loads the matching home surface.
- `/:companyId/review` now resolves an initial destination scope from the same enabled-miniapp order and passes it into destination ops workspace.
- Query `destinationKey` still overrides initial scope in workspace.

This prevents compare-first Units from being forced into classscout-default review surfaces.

## Destination-scoped review queue

Review card listing now supports optional destination filtering:

- `GET /api/destination-review/cards?companyId=:id&destinationKey=:key`
- `destinationKey` is validated against supported destination keys.
- when provided, review cards are filtered by `destinationInstance.destinationKey`.

Workspace propagation:

- destination content-ops workspace passes active destination scope into review workspace
- review workspace includes `destinationKey` in review-card list fetches

This prevents mixed-destination review queues when a Unit has multiple Miniapps enabled.

## Destination-scoped mission control summary

Mission control summary now accepts optional destination scope:

- `GET /api/destination-workflows/mission-control/summary?companyId=:id&destinationKey=:key`
- destination key is validated via shared destination-key guard.
- when destination scope is present, workflow runs, review cards, and outcome memories are filtered by destination instance.

Workspace propagation:

- destination content-ops workspace forwards active destination scope into mission-control component
- mission-control component forwards destination scope to summary API and lane-filters daemon/miniapp items from operations response

## Destination scope query validation

Destination-scoped read endpoints now reject invalid destination keys with `400` instead of silently dropping the filter:

- `GET /api/destination-review/cards`
- `GET /api/destination-workflows/mission-control/summary`

Accepted values remain `classscout` and `compare`.

Additional request validation added:

- both destination-scoped endpoints now require `companyId` query param and return `400` when missing.

## Operations API destination scope

`GET /api/companies/:companyId/operations` now supports optional `destinationKey` query scope:

- accepted: `classscout`, `compare`
- invalid destination key returns `400`
- scoped response filters:
  - `items` miniapp publish rows to requested destination
  - `destinationDaemon.byDestination` lanes to requested destination
  - `summary` and destination-daemon summary counters to scoped data

Mission-control UI now forwards this scope to operations API directly.

## Shared destination scope helper

Added `src/lib/destination-scope.ts` to centralize:

- destination key normalization
- first-supported destination resolution from enabled miniapp arrays
- destination label mapping
- destination capability check for live-listing ops

Home route, review route, and destination workspace now consume this shared helper to reduce routing drift.

## Destination list/read endpoint validation alignment

Validation behavior is now aligned across destination list/read endpoints:

- `GET /api/destination-learning/summary`
- `GET /api/destination-learning/replay-candidates`
- `GET /api/destination-missions/definitions`
- `GET /api/destination-missions/runs`

All now:

- require `companyId` query param (`400` when missing)
- reject invalid `destinationKey` when provided (`400`)
- keep destination auto-resolution behavior when `destinationKey` is omitted

## Destination key normalization convergence

`src/lib/destination-key-resolution.ts` now delegates key validation/normalization to shared helper logic in `src/lib/destination-scope.ts`.

This removes duplicate destination key parsing logic and keeps resolution behavior consistent as destination support evolves.

## Observability destination scope selector

Observability UI now includes an explicit destination scope selector (`all`, `classscout`, `compare`) that updates query state (`destinationKey`) and drives scoped destination mission control + learning panels.

This makes destination-lane observability switching operator-visible without manual URL edits.

## Mission definition destination coercion fixes

Fixed two shared mission-path coercions that incorrectly forced `classscout` typing:

- active mission definition resolution in `startDestinationMissionRun`
- mission definition duplication destination assignment

Both now preserve the actual destination key, preventing compare-path fallback regressions.

Operations response now includes `destinationScope` (`null` or destination key) so clients can confirm whether payload is scoped or global.

Observability now preserves active destination scope when navigating to Internal Evaluation Bench.

## Destination-scoped review detail and mutations

Review card detail and mutation endpoints now support optional destination scoping and strict validation:

- `GET /api/destination-review/cards/:id`
- `POST /api/destination-review/cards/:id/decision`
- `POST /api/destination-review/cards/:id/publish`

Behavior:

- require `companyId` where applicable
- reject invalid `destinationKey` values (`400`)
- when destination scope is provided, review-card destination must match or request returns `404`

UI propagation:

- review workspace now forwards `destinationKey` for review-card detail load, decision submit, and publish actions

## Destination-scoped replay execution hardening

`POST /api/destination-learning/replay-candidates/execute` now supports optional destination scope validation:

- validates `companyId`
- validates `destinationKey` when provided
- for the review-card replay path, enforces review-card destination match before publish replay

Learning panel now forwards active `destinationKey` when executing replay actions.

Replay execute workflow-run path now enforces destination scope match when `destinationKey` is provided.

## Destination-scoped mission recovery hardening

`POST /api/destination-workflows/mission-control/recover` now supports optional destination scope validation:

- validates `companyId`
- validates `destinationKey` when provided
- enforces workflow-run destination match when scope is set (404 on mismatch)

Mission-control UI now forwards active destination scope on retry/replay actions.

Observability destination selector options are now derived from shared destination key registry (`DESTINATION_KEYS`) and shared destination label mapping.

## Live-listing ops route contract hardening

`/api/destination-review/live-listings` is explicitly classscout-only at runtime contract level.

Updates:

- `GET` now requires `companyId` (`400` when missing)
- `GET` rejects non-classscout `destinationKey` (`400`)
- `POST` rejects non-classscout `destinationKey` (`400`)
- live-listing ops UI now sends explicit `destinationKey=classscout` on both list/read and create-revision requests

`GET /api/destination-review/live-listing-status` now explicitly requires `companyId` query param (`400` when missing).

Settings page destination key typing now uses shared destination workflow contract type instead of a local duplicate alias.

Mission-control recover endpoint now strictly validates `actionType` to `RETRY` or `REPLAY` (400 for invalid values).

## Destination scope completion for mission action endpoints and daemon

Completed destination-scope propagation and enforcement for the remaining mission action surface:

- `DestinationRulebookRunner` now forwards `destinationKey` for mission candidate loading and all mission-action callbacks; callback dependencies also include destination scope to avoid stale closures after destination switches.
- `GET /api/destination-missions/runs/:id/candidates` now:
  - requires `companyId`
  - validates `destinationKey` when provided
  - verifies run existence before listing
  - enforces destination mismatch as `404`
- `POST /api/destination-missions/runs/:id/advance-attempt` and `POST /api/destination-missions/runs/:id/mark-terminal` now:
  - require `companyId`
  - validate `destinationKey` when provided
  - enforce destination mismatch as `404`
- `POST /api/destination-missions/daemon` now:
  - validates optional `destinationKey`
  - requires ingest-secret auth when running without explicit `companyId` (configured multi-company daemon path)
  - passes optional destination scope into daemon execution
  - returns `destinationScope` in success/failure payloads
- `executeDestinationMissionDaemonForCompany` now supports optional lane-scoped execution (`destinationKey`) and reports `destinationScope` in result payload.

This closes the contract gap where destination-scoped UI calls could still hit unscoped run-action paths.

## Cron daemon scope parity

`GET /api/cron/destination-missions` now supports optional `destinationKey` scope (`classscout`, `compare`) and validates invalid keys as `400`.

Behavior updates:

- forwards scoped destination into `executeDestinationMissionDaemonForCompany`
- includes `destinationScope` in success and failure responses
- preserves existing background secret requirement and company target resolution

This keeps scheduled daemon execution behavior aligned with manual daemon execution contracts.

## Destination intake contract hardening (valid key enforcement)

Aligned destination-key validation across ingestion and training/export APIs that previously accepted any string key:

- `POST /api/destination-workflows/intake/source`
- `POST /api/destination-workflows/intake/candidate`
- `POST /api/destination-workflows/intake/facts`
- `POST /api/destination-workflows/intake/draft`
- `POST /api/destination-workflows/runs`
- `POST /api/destination-workflows/live-revisions/intake`
- `POST /api/destination-review/outcomes`
- `POST /api/destination-learning/exports`

All now:

- normalize/validate destination key via shared helper
- reject invalid destination keys with `400`
- pass normalized keys into downstream services

Additional export endpoint behavior:

- `companyId` is explicitly required (`400` when missing)
- `destinationKey` is explicitly required (`400` when missing)

This prevents invalid destination strings from entering workflow, review-memory, and learning-export persistence paths.

## Destination API contract convergence (remaining route drift)

Additional API consistency updates completed:

- `POST /api/destination-review/cards`
  - now enforces non-empty `companyId`
  - validates `destinationKey` with shared normalization helper
  - passes normalized values into review card submission
- `GET /api/destination-review/cards`
  - now uses shared destination normalization helper for key validation/parsing

- `POST /api/destination-missions/runs`
  - now uses shared destination normalization helper (removes local key-cast path)
  - normalizes companyId before auth and run creation

- `POST /api/destination-missions/definitions`
  - required-field validation now runs before auth
  - destination key validation now uses shared normalization helper

- `GET /api/destination-workflows/mission-control/summary`
  - destination scope validation now uses shared normalization helper

- Destination mission-definition detail/action routes now require explicit company id (`400`) before membership checks:
  - `GET/PATCH /api/destination-missions/definitions/:id`
  - `POST /api/destination-missions/definitions/:id/activate`
  - `POST /api/destination-missions/definitions/:id/pause`
  - `POST /api/destination-missions/definitions/:id/duplicate`
  - `POST /api/destination-missions/definitions/:id/archive`

- Destination workflow replay/retry routes now require explicit company id (`400`) before membership checks:
  - `POST /api/destination-workflows/runs/:id/replay`
  - `POST /api/destination-workflows/runs/:id/retry`

- `POST /api/destination-review/live-listings`
  - now requires `companyId` before membership auth
  - required-field error narrowed to listing fields after company precheck

## Miniapp Ops workspace route type cleanup

Removed unnecessary `as DestinationKey` casts in canonical Miniapp Ops workspace routes where the route guard already guarantees a typed miniapp id (`classscout`/`compare`):

- `src/app/api/units/[unitId]/miniapps/[miniappId]/missions/route.ts`
- `src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts`

This reduces type coercion noise and keeps Miniapp Ops workspace route typing aligned with destination key contracts.

## Destination workflow detail route hardening

Added explicit `companyId` prechecks (`400` when missing) to additional workflow inspection routes:

- `GET /api/destination-workflows/runs/:id`
- `GET /api/destination-workflows/candidates/:candidateId`

This removes implicit auth-failure behavior when company context is missing and makes error responses deterministic.

## Mission route cast elimination (API layer)

Removed remaining API-layer `as DestinationKey` casts in mission discovery/extraction routes by narrowing destination key once after runtime guard checks:

- `POST /api/destination-missions/runs/:id/discover-candidates`
- `POST /api/destination-missions/runs/:id/extract-candidate`

This keeps typing strict while preserving existing runtime destination validation.

## Company-id precheck closure for membership-protected destination routes

Completed a full destination API audit for membership-protected routes and closed remaining gaps.

Added explicit `companyId` prechecks (`400`) to:

- `POST /api/destination-missions/runs/:id/prepare-candidate`
- `POST /api/destination-missions/runs/:id/score-candidate`

Also tightened validation messaging in those routes so `normalizedListing` is validated independently after company context is established.

Audit result: all destination API routes that call `verifyMembership(...)` now provide explicit `companyId is required` behavior when company scope is missing.

## Live-listing route normalization convergence

ClassScout-only live-listing routes now use shared destination normalization/capability helpers instead of ad-hoc string checks:

- `GET/POST /api/destination-review/live-listings`
- `GET/POST /api/destination-review/live-listing-status`

Behavior preserved:

- routes remain classscout-only
- invalid/non-live-listing destination scopes are rejected with `400`

Implementation effect:

- destination-key parsing and capability checks now follow the same helper contract used by the broader destination API surface.

## Core destination library hardening (cast elimination + key normalization)

Hardened core destination libraries to reduce unchecked destination-key coercion in backend execution paths.

Updated:

- `src/lib/destination-publish-bridge.ts`
  - replaced manual supported-key check + cast with shared `normalizeDestinationKey`
  - removed duplicate publish draft payload derivation (single resolved payload reused)

- `src/lib/destination-mission-definitions.ts`
  - duplicate-definition path now normalizes destination key before creating copied definition

- `src/lib/destination-missions.ts`
  - mission policy update path now normalizes mission destination key before policy normalization/merge

- `src/lib/destination-review-bridge.ts`
  - review decision flow now normalizes review-card destination key once and reuses typed key for correction promotion + outcome memory write
  - throws explicit unsupported-destination error if review-card destination key is invalid

- `src/lib/destination-mission-runner.ts`
  - removed remaining API-level destination cast in fact snapshot creation; relies on typed adapter key directly

Result:

- fewer unchecked destination casts in critical publish/review/mission execution code paths
- shared destination key normalization now guards more low-level backend boundaries

## Ingest payload-shape hardening (`in` operator safety)

Hardened routes that used `field in body` required-field checks without first guaranteeing an object payload.

Updated:

- `POST /api/destination-review/cards`
- `POST /api/destination-review/outcomes`
- `POST /api/destination-workflows/live-revisions/intake`

All now return `400` (`JSON object body is required`) when payload is not an object.

Effect:

- malformed JSON primitives no longer trigger accidental runtime `TypeError` paths and `500` responses during required-field validation.

## Null/primitive JSON hardening for destination mutation routes

Applied a broad safety convergence across destination mutation routes that previously used:

- `await request.json().catch(() => ({}))`

These routes now coerce parsed payloads to object shape safely:

- non-object payloads (`null`, primitive, array) are normalized to `{}` before field access
- this prevents runtime property-access crashes from valid-but-wrong JSON payload types

Touched route families include:

- destination mission run actions (`discover`, `extract`, `score`, `prepare`, `pause/resume`, `execute`, `mark-terminal`, `advance-attempt`, run `PATCH`)
- destination mission definition actions (`activate`, `pause`, `duplicate`, `archive`, `PATCH`)
- destination daemon trigger
- destination replay/mission-control mutation routes
- destination review card publish mutation

This complements the explicit required-field prechecks and keeps bad-payload handling deterministic.

## JSON object-body guard convergence (remaining destination POST routes)

Completed object-body guard coverage for the remaining destination POST routes that previously parsed JSON directly.

Added `JSON object body is required` (`400`) guards to:

- `POST /api/destination-workflows/runs/:id/replay`
- `POST /api/destination-workflows/runs/:id/retry`
- `POST /api/destination-review/cards/:id/decision`
- `POST /api/destination-workflows/runs`
- `POST /api/destination-learning/exports`
- `POST /api/destination-missions/runs`

Result:

- destination routes no longer assume object payload shape after JSON parse
- malformed `null`/primitive/array payloads are rejected explicitly and safely.

## Miniapp mutation payload-shape hardening

Extended object-payload safety guards to canonical miniapp mutation routes under units API.

Updated:

- `POST /api/units/:unitId/miniapps/:miniappId/missions`
- `POST /api/units/:unitId/miniapps/:miniappId/content/:contentId/refresh`
- `POST /api/units/:unitId/miniapps/:miniappId/cards/:cardId/approve`

All now normalize parsed request payload shape before field access:

- `bodyRaw` parse with fallback
- object-only coercion (`Record<string, unknown>`) before reading properties

Effect:

- valid JSON primitives/null/arrays no longer risk runtime property-access failures in miniapp operator mutation paths.

## Destination scope comparison convergence (replay/recover)

Removed remaining manual lowercase destination-key comparisons in replay/recovery mutation routes.

Updated:

- `POST /api/destination-workflows/mission-control/recover`
- `POST /api/destination-learning/replay-candidates/execute`

Both now validate run destination scope using `normalizeDestinationKey(...)` on persisted run keys before comparing with the requested destination scope.

Effect:

- destination matching behavior now follows shared normalization semantics instead of ad-hoc string-lowercase checks.

## Maintenance adapter typed iteration cleanup

Updated destination maintenance adapter execution loop to iterate via shared destination key registry:

- `src/lib/destination-maintenance-adapters.ts`

Change:

- replaced `Object.keys(... as DestinationKey[])` loop with `for (const destinationKey of DESTINATION_KEYS)`.

Effect:

- removes a low-level cast path and keeps adapter iteration aligned with canonical destination key definitions.

## Final `DestinationKey` cast removal in shared normalization helper

Updated `src/lib/destination-scope.ts` to remove the last explicit `as DestinationKey` cast from key normalization.

`normalizeDestinationKey(...)` now:

- normalizes string input
- matches against `DESTINATION_KEYS` through typed iteration
- returns typed key directly without cast

Effect:

- destination key typing now relies on typed key registry checks end-to-end without explicit `DestinationKey` cast expressions in API/lib layers.

## Operations API destination contract alignment

Aligned company operations API destination handling with shared destination registry/normalization helpers.

Updated:

- `GET /api/companies/:companyId/operations`
- file: `src/app/api/companies/[companyId]/operations/route.ts`

Changes:

- destination scope query validation now uses `normalizeDestinationKey(...)`
- destination key registry now uses shared `DESTINATION_KEYS`
- mission definition/run aggregation now normalizes DB destination keys with shared helper before bucketing
- response `destinationScope` now returns normalized key or `null`

Effect:

- operations dashboard destination scoping now follows the same canonical key contract as destination mission/review/workflow APIs.

## Operations action route hardening + destination parser convergence

Updated `POST /api/companies/:companyId/operations/:itemId/:action` to align with shared destination parsing and safe payload-shape handling.

Changes:

- miniapp operation item parsing now resolves destination key via `normalizeDestinationKey(...)` instead of manual lowercase cast
- action request body now uses object-shape coercion before property reads (`reason`, `idempotencyKey`)

Effect:

- operation action parser no longer depends on direct key casts for miniapp destination scope
- malformed JSON payloads no longer risk runtime property-access failures in operations action handler.

## Company daemon-policy payload-shape normalization

Updated `PATCH /api/companies/:companyId/daemon-policy` payload parsing to normalize parsed JSON into object shape before downstream patch validation.

Change:

- `bodyRaw` parse + object-only coercion before `normalizePatchPayload(...)`

Effect:

- route now matches the broader payload-shape safety pattern used across operations/miniapp/destination mutation APIs.

## Publish bridge normalization cleanup

Updated destination publish bridge key parsing to defer normalization entirely to shared helper logic.

- file: `src/lib/destination-publish-bridge.ts`
- change: removed manual `.toLowerCase()` pre-normalization on persisted destination key before `normalizeDestinationKey(...)`

Effect:

- publish bridge now uses a single canonical normalization path consistent with the rest of destination key handling.

## Live-listings POST payload-shape convergence

Normalized `POST /api/destination-review/live-listings` request parsing to match the shared object-body safety pattern.

Change:

- replaced nullable body parse with object-shape coercion (`bodyRaw` -> object-only `body`)

Effect:

- classscout live-listing mutation route now matches payload-shape handling used across destination, miniapp, and operations mutation endpoints.

## Company + unit API payload-shape hardening and miniapp-id cast removal

Applied additional safety alignment in company/unit API surfaces and Miniapp Ops workspace route guard typing.

Updated:

- `POST /api/companies/:companyId/members`
- `PATCH /api/companies/:companyId/settings`
- `POST /api/companies`
- `PATCH /api/companies`

All now:

- parse body with fallback
- enforce object payload shape before field access
- return `400` with `JSON object body is required` on non-object payloads

Also updated:

- `src/lib/check-foundation/miniapp-route-guard.ts`

Change:

- removed explicit `as MiniappId` cast by using assert-based narrowing (`assertKnownMiniappId`) on normalized miniapp id.

Effect:

- company/unit mutation routes now match the same request-body safety pattern used across destination/operations/miniapp mutations
- Miniapp Ops workspace route context typing now uses assertion narrowing rather than explicit id casts.

## Company route param precheck closure (`companyId`)

Added explicit `companyId` param prechecks (`400`) to remaining company routes that previously assumed route params were always populated.

Updated:

- `GET/PATCH /api/companies/:companyId/settings`
- `GET/POST/DELETE /api/companies/:companyId/members`

Effect:

- these routes now match the same explicit company-scope guard behavior used across other company APIs before auth and downstream access.

## Core module API payload-shape + auth-order hardening (topics/sources/workflows/events)

Extended mutation safety and auth-order consistency to additional high-traffic core module APIs.

Updated:

- `GET/POST/PATCH /api/topics`
- `GET/POST/PATCH /api/sources`
- `PATCH /api/workflows`
- `POST /api/events`

Changes:

- added object-body parsing guards for mutation routes (`JSON object body is required` on malformed payloads)
- ensured company-scope presence checks happen before membership verification in list routes where needed (`topics`, `sources` GET)

Effect:

- prevents malformed JSON payload crashes in these core board/workflow/data ingestion routes
- keeps auth checks dependent on explicit company scope consistently ordered.

## Ingestion/background endpoint payload hardening (sources, local agent, webhook, knowmore sync)

Hardened additional background-entry routes that previously parsed request JSON without object-shape enforcement.

Updated:

- `POST /api/sources/ingest`
- `POST /api/sources/bridge`
- `POST /api/agent/local`
- `POST /api/webhook/trigger`
- `POST /api/knowmore/sync`

Changes:

- added object-body guards (`JSON object body is required`) where applicable
- ingestion bridge routes now accept object-or-array payload roots, and validate each batch item is an object
- `agent/local` and `knowmore/sync` now enforce `companyId` presence/type before continuing

Effect:

- prevents malformed payload runtime failures on key system entrypoints
- makes batch ingestion behavior explicit and resilient when invalid items are mixed into payload arrays.

## 2026-05-31 — API hardening pass (`communication`, `feedback`, `observability`, `evaluations`, `pipeline-jobs`)

This slice continues the same platform-wide contract tightening pattern: reject non-object JSON payloads early, then normalize key scalar fields before business logic and mutations.

### 1) Communication settings payload hardening
- File: `src/app/api/communication/settings/route.ts`
- `PATCH` now enforces `JSON object body is required` for non-object payloads.
- Normalizes `channel`, `handle`, `isEnabled`, and `minIceScore` before upsert.
- Interaction/outcome telemetry `changedFields` and weight logic now key off normalized values.

### 2) Strategic feedback payload hardening
- File: `src/app/api/feedback/route.ts`
- `POST` now enforces object payload shape.
- Normalizes `companyId`, `entityId`, `entityType`, `action`, and optional text fields before create.
- Adds explicit required-field protection for missing `action` alongside existing core identifiers.

### 3) Hashtag feedback payload hardening
- File: `src/app/api/hashtags/feedback/route.ts`
- `POST` now enforces object payload shape before entity/tag parsing.
- Keeps current hashtag business behavior unchanged while preventing array/primitive request bodies.

### 4) Observability control action hardening
- File: `src/app/api/observability/route.ts`
- `PATCH` now enforces object payload shape.
- Normalizes `companyId` and `action` extraction before authorization/action dispatch.

### 5) Evaluations action payload hardening
- File: `src/app/api/evaluations/route.ts`
- `POST` now enforces object payload shape.
- Normalizes `companyId`, `action`, `runId`, `persistObservability`.
- Safely gates optional `candidate` hydration to object values only before passing into comparison.

### 6) Pipeline jobs mutation payload hardening
- File: `src/app/api/pipeline-jobs/route.ts`
- `PATCH` now enforces object payload shape.
- Normalizes `companyId`, reorder identifiers, and column keys before guarded mutation operations.

### Delivery impact
- Removes another cluster of runtime-shape edge cases where array/primitive bodies could pass into mutation code.
- Keeps company-scope checks and operational semantics intact while tightening request contracts.
- Improves reliability for future destination/public-app workflows that share these control and feedback surfaces.

## 2026-05-31 — Miniapp and destination review route contract convergence

This pass focuses on canonical miniapp/public-destination flows and aligns body-shape handling + destination-key usage consistency.

### 1) Miniapp mission start route
- File: `src/app/api/units/[unitId]/miniapps/[miniappId]/missions/route.ts`
- `POST` now rejects non-object payloads (when payload is present) with `JSON object body is required`.
- Keeps optional-body behavior (`{}` fallback) for existing callers.

### 2) Miniapp card approval route
- File: `src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/approve/route.ts`
- `POST` now rejects non-object payloads (when payload is present).
- Preserves existing optional-body semantics for backward compatibility.

### 3) Miniapp content refresh route
- File: `src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts`
- `POST` now rejects non-object payloads (when payload is present).
- Preserves existing optional-body semantics.

### 4) Destination review card publish route
- File: `src/app/api/destination-review/cards/[id]/publish/route.ts`
- `POST` now requires a JSON object body and validates `companyId` via typed extraction.
- Removes permissive fallback that previously accepted malformed payload shapes.

### 5) Live listing status ingestion route
- File: `src/app/api/destination-review/live-listing-status/route.ts`
- `POST` now requires JSON object payload.
- Uses validated `payload.destinationKey` instead of hardcoded destination in status lookup.

### 6) Live listing revision trigger route
- File: `src/app/api/destination-review/live-listings/route.ts`
- `POST` now requires JSON object payload.
- Keeps existing `companyId`, `destinationKey`, `listingId`, `listingType` contract behavior.

### Delivery impact
- Tightens canonical miniapp + destination review mutation surfaces.
- Reduces silent acceptance of malformed payloads in key operator workflows.
- Improves long-term readiness for destination-key expansion while keeping existing classscout behavior intact.

## 2026-05-31 — Destination mission definition API contract hardening

This pass hardens all definition-management mutation routes in the destination mission control surface.

### Files updated
- `src/app/api/destination-missions/definitions/route.ts`
- `src/app/api/destination-missions/definitions/[id]/route.ts`
- `src/app/api/destination-missions/definitions/[id]/activate/route.ts`
- `src/app/api/destination-missions/definitions/[id]/pause/route.ts`
- `src/app/api/destination-missions/definitions/[id]/duplicate/route.ts`
- `src/app/api/destination-missions/definitions/[id]/archive/route.ts`

### What changed
- Mutation endpoints now reject invalid/non-object JSON bodies using the standard `JSON object body is required` response.
- `companyId` extraction was tightened from permissive string coercion to explicit string validation.
- Create route now normalizes `destinationKey`, `missionKind`, and `name` before persistence.
- Update route now enforces object payload shape before applying partial config/status updates.

### Why this matters
- Removes another class of hidden runtime failures from malformed client payloads.
- Makes mission-definition administration behavior consistent with other recently hardened control surfaces.
- Improves production safety for multi-unit miniapp pipelines that rely on predictable definition lifecycle APIs.

## 2026-05-31 — Destination mission run lifecycle API hardening

This pass hardens the mission run-control lifecycle used by ClassScout/Compare operational flows.

### Files updated
- `src/app/api/destination-missions/runs/[id]/route.ts`
- `src/app/api/destination-missions/runs/[id]/pause/route.ts`
- `src/app/api/destination-missions/runs/[id]/resume/route.ts`
- `src/app/api/destination-missions/runs/[id]/mark-terminal/route.ts`
- `src/app/api/destination-missions/runs/[id]/advance-attempt/route.ts`
- `src/app/api/destination-missions/runs/[id]/discover-candidates/route.ts`
- `src/app/api/destination-missions/runs/[id]/execute-next-attempt/route.ts`
- `src/app/api/destination-missions/runs/[id]/execute-until-blocked/route.ts`
- `src/app/api/destination-missions/runs/[id]/prepare-candidate/route.ts`
- `src/app/api/destination-missions/runs/[id]/extract-candidate/route.ts`
- `src/app/api/destination-missions/runs/[id]/score-candidate/route.ts`

### What changed
- Standardized mutation-body validation to reject non-object payloads with `JSON object body is required`.
- Tightened `companyId` extraction from permissive coercion to explicit string checks.
- Tightened destination key checks from truthy-only guards to explicit provided-value validation (`destinationKeyRaw !== undefined`).
- Preserved direct state-machine behavior only for lifecycle/operator state controls such as pause/resume, terminal marking, advance-attempt, and run `PATCH`.
- Replaced Webapp-side mission intelligence execution for `discover-candidates`, `extract-candidate`, `score-candidate`, `prepare-candidate`, `execute-next-attempt`, and `execute-until-blocked` with queued `DESTINATION_MISSION_DAEMON` Playlist receipts via `src/lib/destination-mission-queue.ts`.
- ClassScout/Compare discovery, extraction, scoring, preparation, candidate persistence, fact snapshots, retry/timeout behavior, and mission-state movement now belong to CHECK Local for those action routes.

### Why this matters
- Removes malformed payload drift across the most critical mission execution controls.
- Improves runtime predictability for operator-triggered recovery/execution actions.
- Aligns high-risk mission control endpoints with the same contract-hardening baseline now used across the wider platform.

## 2026-05-31 — Destination workflow intake + replay/daemon + bridge ingress hardening

This pass closes a key reliability gap around intake and replay controls used by destination pipelines.

### Files updated
- `src/app/api/destination-workflows/mission-control/recover/route.ts`
- `src/app/api/destination-learning/replay-candidates/execute/route.ts`
- `src/app/api/destination-missions/daemon/route.ts`
- `src/app/api/destination-workflows/intake/candidate/route.ts`
- `src/app/api/destination-workflows/intake/source/route.ts`
- `src/app/api/destination-workflows/intake/facts/route.ts`
- `src/app/api/destination-workflows/intake/draft/route.ts`
- `src/app/api/bridge/ingress/route.ts`

### What changed
- Added standard object-payload validation to mutation endpoints (reject non-object payloads).
- Tightened `companyId` extraction from permissive string coercion to typed string checks.
- Tightened destination key validation to explicit provided-value checks in replay/daemon/recover control paths.
- Preserved existing business behavior for mission replay/retry, daemon batching, and destination intake persistence.

### Why this matters
- Prevents malformed payloads from entering core workflow/runtime control APIs.
- Improves operational predictability for recovery/replay flows supporting Miniapps.
- Aligns ingest and control surfaces with the same hardened contract baseline applied across other modules.

## 2026-05-31 — Final API payload-contract sweep (remaining routes)

This pass closes the remaining route set and standardizes JSON body handling across all API handlers using `request.json()`.

### Files updated
- `src/app/api/checklist/route.ts`
- `src/app/api/data-files/route.ts`
- `src/app/api/enrichment-policies/route.ts`
- `src/app/api/knowmore/corrections/route.ts`
- `src/app/api/companies/[companyId]/daemon-policy/route.ts`
- `src/app/api/opportunitycards/route.ts`
- `src/app/api/knowmore/actions/route.ts`
- `src/app/api/flashcards/route.ts`
- `src/app/api/companies/[companyId]/operations/[itemId]/[action]/route.ts`
- `src/app/api/knowmore/health/route.ts`
- `src/app/api/intelligence/snapshot/route.ts`
- `src/app/api/answers/route.ts`

### What changed
- Added/standardized `JSON object body is required` guards on JSON mutation routes.
- Added missing `companyId` prechecks on key list/read routes where membership checks were previously called first.
- Replaced permissive company id coercion with explicit typed extraction where relevant.
- Preserved existing business logic while converging request-contract behavior.

### Validation result
- Gap scan (`request.json()` without standardized object-body guard pattern) now returns zero remaining API route files.

### Why this matters
- This removes remaining inconsistencies between implementation behavior and expected API contracts.
- It reduces silent malformed-payload acceptance and improves predictable operator behavior across all blocks/modules.

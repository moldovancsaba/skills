# check Unit Control-Plane LLD (v2.1)

This document is the high-precision implementation guide for Unit control, Block enablement, legacy webapp profile routing, and board runtime composition.
It is intended to be executable by any developer with minimal ambiguity.

It is subordinate to:

1. [docs/RULEBOOK.md](./RULEBOOK.md)
2. [docs/SSOT.md](./SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](./SYSTEM_DESIGN_LLD.md)
4. [docs/CHECK_FOUNDATION_LLD.md](./CHECK_FOUNDATION_LLD.md)
5. [docs/IMPLEMENTATION_RULEBOOK.md](./IMPLEMENTATION_RULEBOOK.md)
6. [docs/WEBAPP_READ_MODEL_LLD.md](./WEBAPP_READ_MODEL_LLD.md)

Terminology note:

- product language is Block-first
- current implementation still contains `webappProfile` and `unitCapabilities.modules`
- those names are compatibility details until the v3 Block capability payload lands

## 1. Why this control-plane exists

The current production system has three realities:

1. Intelligence units are company scopes, but unit behavior is not identical.
2. Local AI performs heavy computation; webapp pages must stay projection-first and lightweight.
3. A board-like execution surface (`unit-board`) must be shared across all surfaces without coupling to specific webapp logic.

This design gives us one strict control plane with these guarantees:

- Block-based enablement that supports optional products per Unit
- compatibility with existing Block-first capability-based routing
- per-unit capability matrix for module exposure
- one board contract usable by all unit surfaces
- deterministic, observable write/read APIs
- storage policy separation between Atlas operational state and local audit events

The result is predictable production behavior and faster cross-surface onboarding for new units.

Customer-value delivery note:

- `/:companyId/customer-operations` is a membership-gated operator cockpit that intentionally does not require an additional capability flag.
- The route composes Sales, Miniapp, runtime, read-model, learning-memory, and notification readiness into one customer operations surface.
- Its detailed contract is [CUSTOMER_VALUE_DELIVERY_LLD.md](./CUSTOMER_VALUE_DELIVERY_LLD.md).

## 2. Canonical architecture map

```mermaid
flowchart TB
  Browser["Operator Browser"]
  App["Next.js Webapp<br/>src/app"]
  Auth["Session + Membership"]
  BoardAPI["/api/board-items"]
  UnitAPI["Settings & Nav APIs"]
  ReadModel["IntelligenceSnapshot.webappProjection"]
  Atlas[(Atlas)]
  LocalDB[(LOCAL_DATABASE_URL)]
  AI["Local AI Runtime"]
  SnapshotWorker["snapshot-worker"]
  Guardian["guardian + sync"]
  Status["/local-ai status-server"]

  Browser -->|HTTP| App
  App -->|read| Atlas
  App -->|read projection| ReadModel
  App -->|write intents + intents only| Atlas
  App --> UnitAPI
  App --> BoardAPI
  UnitAPI -->|settings persistence| Atlas
  BoardAPI -->|cards+states persistence| Atlas
  AI -->|writes updates/events| Atlas
  AI -->|reads intents, jobs, tasks| Atlas
  AI -->|writes event ledger| LocalDB
  SnapshotWorker -->|rebuilds projection| Atlas
  Guardian -->|monitor, recover, restart| AI
  Status --> AI
  Status --> Atlas
```

## 3. Runtime topology

```mermaid
flowchart LR
  WebappProfile["resolve legacy profile / effective Blocks"] -->|NONE| RouteGeneric["/{companyId} -> UnitHome"]
  WebappProfile -->|CLASSSCOUT| RouteClassScout["/{companyId} -> ClassScout Miniapp Ops"]
  WebappProfile -->|COMPARE| RouteCompare["/{companyId} -> Compare Miniapp Ops"]
  RouteClassScout -->|gates modules| Nav["/api/companies/{companyId}/nav"]
  RouteCompare -->|gates modules| Nav
  RouteGeneric -->|gates modules| Nav
  Nav -->|module matrix| Sidebar["client-nav"]
  Sidebar -->|opens surfaces| ModuleSurfaces["Data / Topics / Knowmore / Goals / Checklist / Tactical / AI Queue / Sales / etc."]
  Sidebar --> UnitBoard["/{companyId}/unit-board"]
  UnitBoard --> BoardAPI
```

### 3.1 Runtime responsibilities

#### Webapp responsibilities
- Resolve Unit Blocks, legacy webapp profile, and Modules.
- Render routes from projection contracts.
- Capture operator intents and minimal edits.
- Never run bulk scoring, queue planning, enrichment, or heavy AI orchestration.

#### Local AI responsibilities
- Execute all heavy planning, scoring, scoring repair, pipeline jobs.
- Build webapp projection and operational refresh state.
- Consume operator intents and feed queue/state back to Atlas.
- Persist heavy events in local audit DB, not Atlas.
- Feed Miniapp intelligence flows for ClassScout and Compare.
- Expose enough health evidence for CHECK to show when Miniapp content is fresh, stale, blocked, retrying, or disconnected.

### 3.2 Miniapp intelligence health rule

Miniapp enablement is only the control-plane permission to expose a Miniapp.
It is not proof that the Miniapp content loop is healthy.

ClassScout and Compare are healthy only when all of these are true:

- the Miniapp Block is enabled for the Unit
- the matching destination instance is active
- Local AI runtime is reachable and processing
- current intelligence/source input exists for that destination
- mission/review/publish workflow evidence exists or a clear setup-required state is shown
- observability exposes stale, blocked, retrying, and failed states
- rollback/recovery steps are documented and tested

This health rule is part of the implementation plan and release gate. Work on new surfaces must not bypass it.

## 4. Core domain model

### 4.1 Intelligence Unit
- Company-scoped runtime subject.
- Has:
  - storage identity (`company.id`)
  - capability config (`company.workerConfig.unitCapabilities`)
  - projection (`IntelligenceSnapshot`)
  - destination enablement (`destinationInstance`)

### 4.2 Block capability model

Target product model:

- a Unit enables Blocks
- Blocks require Modules
- Webapp renders enabled Block entry points
- Local schedules work from enabled Blocks

Initial Blocks:

- `checklist`
- `sales`
- `project`
- `miniapp`

### 4.3 Legacy webapp profile
`unitCapabilities.webappProfile` values:
- `NONE`
- `CLASSSCOUT`
- `COMPARE`

This is a compatibility field. Product-facing work should say Block, Miniapp, Miniapp Ops, Webapp, and Local.

### 4.4 Modules
The module key set is:
- `content`
- `data`
- `checklist`
- `analytics`
- `goals`
- `knowmore`
- `pipeline`
- `review`
- `sales`
- `tactical`
- `topics`
- `unit-board`
- `webapp`

`webapp` is currently present in every legacy UI profile and maps the dedicated Miniapp Ops surface route (`/classscout` or `/compare`).

### 4.5 Board domain
- `BoardCard` holds stable card metadata (`title`, `description`, creator, timestamps).
- `BoardItemState` stores board runtime view state (`columnKey`, `orderRank`, `priority`, `metadata`).
- `boardKey` partitions board type:
  - `UNIT_PROJECT` for the shared unit board.
- `entityType` follows surface config:
   - `unit-board`: `BOARD_CARD`
   - `goals`: `GOALCARD`
   - `topics`: `TOPIC`
   - `data`: `SOURCE`
   - `pipeline`: `PIPELINE_JOB`

## 5. Technology stack and dependencies

### 5.1 Webapp stack
- Framework: Next.js 16 App Router
- UI: React 18, Mantine 7, dnd-kit, Tabler icons
- Data: Prisma client, MongoDB Atlas
- Build/test: ESLint, TypeScript, Node scripts

### 5.2 Runtime stack
- Supervisor: `guardian` (watchdog/restart/health)
- Foreground worker: `sync`
- Background worker: `snapshot-worker`
- Local status surface: `status-server`
- AI runtime: Ollama/LLM runtime managed by worker scripts

### 5.3 Storage dependencies
- `DATABASE_URL` points to Atlas
- `LOCAL_DATABASE_URL` points to local Mongo for heavy audit/event tables
- `prisma/schema.prisma` owns Atlas tables; local audit events are written through a dedicated local audit client in `src/lib/local-audit-db.ts`

### 5.4 External package dependencies
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for board drag
- `@mantine/notifications` for operator-visible warnings
- Mandatory frontend standard: all new UI/UX work must use `sovereignsquad/general-design-system`

## 6. Data contracts

### 6.0 Delivered refactor contract slice

The current implementation supports two compatibility layers at the same time:

- v3 Block-first runtime capabilities through `src/lib/check-foundation/capabilities-v3.ts`
- v2 legacy webapp profile/module projection through `src/lib/intelligence-unit-capabilities.ts`

### 6.1 Board adapter registry contract

The board control plane is centralized in `src/lib/board-adapters.ts`.
No surface may hard-code board identity, entity type, status mapping, or write policy outside this registry.

Registered surfaces:

- `unitBoard` maps `unit-board` to `UNIT_PROJECT` / `BOARD_CARD` and is writable.
- `aiQueue` maps `pipeline` to `PIPELINE_QUEUE` / `PIPELINE_JOB` and is projection read-only.
- `goals` maps `goals` to `GOALS` / `GOALCARD` and is projection read-only.
- `topics` maps `topics` to `TOPICS` / `TOPIC` and is projection read-only.
- `data` maps `data` to `DATA_SOURCES` / `SOURCE` and is projection read-only.
- `knowmore` maps `knowmore` to `KNOWMORE` / `KNOWMORE_PACKET` and is projection read-only.
- `review` maps `review` to `REVIEW` / `REVIEW_ITEM` and is projection read-only.
- `tactical` maps `tactical` to `TACTICAL` / `TACTICAL_TASK` and is projection read-only.
- `sales` maps `sales` to `SALES` / `OPPORTUNITYCARD` and is projection read-only.

Resolution order:

1. `surface`
2. `module`
3. `boardKey`
4. `entityType`
5. legacy default
6. read-only fallback

Legacy default applies only when no selector is provided.
Explicit unsupported combinations must not silently become writable.
They recover to a read-only `UNIT_PROJECT` fallback with `adapter.diagnostics.reasonCode = "board-adapter-module-fallback"`.

### 6.2 Board adapter runtime flow

`GET /api/board-items` resolves an adapter before reading cards and states.
The response preserves the existing `items`, `columns`, and `traceId` fields and adds:

```json
{
  "adapter": {
    "surface": "goals",
    "module": "goals",
    "boardKey": "GOALS",
    "entityType": "GOALCARD",
    "allowWrite": false,
    "resolvedBy": "module",
    "diagnostics": {
      "reasonCode": "board-adapter-resolved",
      "retryable": false,
      "recovered": false,
      "warnings": []
    }
  }
}
```

`POST`, `PATCH`, and `DELETE` must reject read-only adapters before persistence.
The error payload must include `adapter.diagnostics` so the caller can distinguish expected read-only projection behavior from a broken board.

### 6.3 Status adapter and domain-row mapping

All module surfaces normalize source states through `normalizeBoardTargetForModule(module, status)`.
Known states map deterministically to board columns:

- queued, ready, and todo map to `TODO`
- active, running, processing, and in-progress map to `IN_PROGRESS`
- blocked, failed, and retrying map to `BLOCKED`
- done, complete, completed, and published map to `DONE`
- missing or unknown states map to the first configured adapter column

Domain records must pass through `adaptDomainRowToBoardCard(module, row)` before rendering in a board surface.
The adapter stores source evidence in `metadata.sourceRow`, `metadata.sourceStatus`, and `metadata.sourceEntityType`.

### 6.4 Observability, retries, and recovery

Every adapter resolution can produce a `BOARD_ADAPTER_RESOLUTION` telemetry payload with:

- `unitId`
- `companyId`
- `surface`
- `module`
- `boardKey`
- `sourceProfile`
- `targetProfile`
- `capabilitiesVersion`
- `reasonCode`
- `retryable`
- `recovered`
- `warnings`

Operational behavior:

- `board-adapter-resolved` is normal and non-retryable.
- `board-adapter-legacy-default` is recovered compatibility behavior and should be removed only after all callers provide selectors.
- `board-adapter-module-fallback` is recovered, retryable configuration drift and must show an operator-visible fallback notice.
- Read-only adapter writes are rejected without partial persistence.
- Fallback writes are rejected before database mutation, making rollback a no-op.
- Recovery is to send a supported `surface`, `module`, `boardKey`, or `entityType` selector.

### 6.5 Capability control transaction contract

Capability changes use the transaction route, not direct settings mutation.
The response must expose:

- `version`
- `resolutionSource`
- `effectiveProfile`
- `effectiveModules`
- `changedBy`
- `effective`
- `warnings`
- `errors`
- `impact`
- optional `runtime`

UI states must support loading, dirty, save success, save failure, validation blocked, and read-only.
Critical disables must be presented as explicit operator intent and persisted through `uiIntent`.
The telemetry event for surface mutation remains `UNIT_SURFACE_UPDATE`.

### 6.6 Regression and release gate

`npm run test:control-plane-board-adapters` is the source-level contract harness for issues #288 through #292.
It verifies:

- every required module adapter is registered
- fallback diagnostics are explicit
- board API responses expose `adapter.diagnostics`
- write rejection paths include diagnostics
- capability transaction responses carry operator-facing resolution metadata
- this LLD documents telemetry and recovery behavior

The harness is intentionally database-free so it can run in CI before integration fixtures exist.

Delivery rules:

- `profile` and legacy `webappProfile` must both normalize into the same `UnitWebappProfile` contract
- invalid module override values must return validation errors instead of silently resolving to defaults
- `/api/companies/[companyId]/settings` and `/api/companies/[companyId]/nav` must expose the same normalized profile/module contract
- route and nav consumers must use normalized capabilities, never raw `company.workerConfig`
- package validation must reject Blocks that are not allowed by the selected Unit package before UI or Local operations consume the configuration
- `POST /api/companies/[companyId]/capabilities/transaction` must reject package-incompatible capability payloads with `422` and
  `block-not-allowed-by-package` errors from `validateUnitPackageChange` when a proposed Block set is outside the selected package.

Relevant verification:

- `npm run test:unit-capability-v2`
- `npm run test:capability-transaction`
- `npm run test:intelligence-unit-refactor`
- `npm run test:check-foundation-packages`
- `npm run build`

### 6.1 Persisted worker config contract
Stored in `company.workerConfig` as JSON:

```json
{
  "unitCapabilities": {
    "schemaVersion": 3,
    "payload": {
      "v": 3,
      "blocks": {
        "checklist": { "enabled": true },
        "sales": { "enabled": true },
        "project": { "enabled": false },
        "miniapp": { "enabled": true }
      },
      "modules": {
        "data": true,
        "checklist": true,
        "project": false
      },
      "miniapps": {
        "classscout": { "enabled": true },
        "compare": { "enabled": false }
      }
    }
  }
}
```

- canonical write-path is now block-first via `POST /api/companies/{companyId}/capabilities/transaction`.
- read paths support both:
  - v3 capability envelopes (`schemaVersion: 3`) as source of truth
  - legacy v2 profile/module envelopes for backward compatibility projection
- `resolveEffectiveUnitCapabilities` computes the effective enabled blocks/modules/miniapps for runtime gating.
- `resolveUnitCapabilities` projects v3 data into legacy profile/module response shape when legacy consumers still request it.
- validation failures in transaction mode return `422` with deterministic field-level error codes.
- optimistic concurrency conflicts return `409` using `expectedVersion` versus current server `version`.

### 6.2 Project board contract
API contract for `unit-board`:

#### Board item shape (API response)
- `id`
- `entityType`
- `boardKey`
- `title`
- `description`
- `createdBy`
- `createdAt`
- `updatedAt`
- `columnKey`
- `orderRank`
- `priority`
- `assignee`
- `dueDate`
- `estimatedEffort`
- `sourceType`
- `sourceId`
- `notes`

#### Column configuration
- `IDEABANK`
- `ROADMAP`
- `BACKLOG`
- `TODO`
- `IN_PROGRESS`
- `REVIEW`
- `DONE`

### 6.3 Projection contract
Used by hot routes:
- `company.counts` and `company.navCounts`
- `readModel.topTasks`
- `readModel.analytics`
- `readModel.projectionFreshness`
- surface-level summary fields from `IntelligenceSnapshot.webappProjection`

### 6.4 Capability contracts
From `src/lib/intelligence-unit-capabilities.ts`:
- `resolveUnitCapabilities(input)` -> `{ profile, modules, source }`
- `normalizeUnitCapabilitiesPayload(raw)` -> validated, merged profile defaults

## 7. Runtime flows and state machines

### 7.1 Route resolution flow
```ts
if (initialData.webappProfile === "CLASSSCOUT") render ClassScoutHome;
else if (initialData.webappProfile === "COMPARE") render CompareHome;
else render CompanyDashboard;
```

Source for `initialData`:
- `getDashboardInitialData(companyId)` resolves:
  - company
  - snapshot
  - destination presence
  - webapp profile and module matrix

### 7.2 Module gated navigation flow
- `ClientNav` fetches `/api/companies/{companyId}/nav`.
- `webapp.profile` and `webapp.modules` come back from nav API.
- `webapp.route` is the resolved dedicated profile route or `null`.
- `webapp.routeTargets.classscout` is owned by `src/lib/classscout-routes.ts` and resolves:
  - `/{companyId}/classscout` as the ClassScout landing route
  - `/{companyId}/review` as generic review infrastructure
  - `/{companyId}/review?tab=review&destinationKey=classscout` as the ClassScout content creation and review card route
  - `/{companyId}/review?tab=ops&destinationKey=classscout` as ClassScout-scoped review ops infrastructure
  - `/{companyId}/observability` as generic mission-control infrastructure
- `src/lib/classscout-routes.ts` also owns `resolveClassScoutEntryPoint`.
  - generic ClassScout entry points resolve to `/{companyId}/classscout`
  - explicit Content Ops intent preserves `/{companyId}/review?tab=review&destinationKey=classscout`
  - explicit Live Catalog intent preserves `/{companyId}/review?tab=ops&destinationKey=classscout`
  - explicit Mission Control intent preserves `/{companyId}/observability`
  - explicit Visitor Ops intent preserves `/{companyId}/classscout/visitor-ops`
- `webapp` profile route rendered if available.
- Module list filtered to `moduleCapabilities[key] !== false`.
- Deep-link not required to exist in nav to navigate currently; route should still recover gracefully.
- ClassScout renders with stable sidebar key `classscout`; Compare renders with stable sidebar key `compare`.
- ClassScout badge counts come from the nav read model when available; badge absence must not hide the item.
- ClassScout active state covers `/{companyId}/classscout` and grouped descendant routes.

### 7.2.1 ClassScout Entry-Point Migration
- Default policy: every generic ClassScout launch opens the canonical ClassScout home.
- Preserved deep links are allowed only when the visible label names the specific workflow.
- The destination unit panel primary action now opens ClassScout home.
- Destination unit panel Mission Control and Live Catalog buttons remain explicit deep links.
- ClassScout Content Ops is always destination-scoped to the review card tab; it must not fall back to a generic contact/opportunity card surface.
- Visitor Ops exposes a visible `Review Content Cards` action that returns operators to the ClassScout content creation/review queue.
- Entry-point classifications include `sourceSurface`, `intent`, `targetDestination`, `preservesDeepLink`, `compatibilityRedirectRequired`, and `accessibleLabel`.
- Rollback is local to each source surface because every migrated source calls the shared resolver instead of hardcoding routes.

### 7.2.2 ClassScout Navigation Quality
- Sidebar visibility uses the stable `classscout` item key and optional `counts.classscout`.
- Sidebar active state covers the canonical route and descendants.
- Landing telemetry emits:
  - `CLASSSCOUT_HOME_LOADED`
  - `CLASSSCOUT_ACTION_OPEN`
- Migrated unit-panel launches emit `CLASSSCOUT_ENTRY_POINT_OPEN`.
- Landing load telemetry includes degraded source slices so support can distinguish data failure from route/UI failure.
- Action controls keep accessible labels and text labels; status is never color-only.
- Regression coverage lives in:
  - `scripts/test-classscout-surface-contract.mjs`
  - `scripts/test-classscout-navigation-quality-contract.mjs`

### 7.3 Settings flow
- `GET /api/companies/{companyId}/settings` returns `unitCapabilities`.
- `GET /api/companies/{companyId}/settings` also returns `unitCapabilitiesV2`, `capabilitiesVersion`, and `webapp.profile/modules/profileLabel`.
- `PATCH /api/companies/{companyId}/settings` accepts `unitCapabilitiesV2` for compatibility-safe profile/module writes and persists a normalized v2 envelope.
- `PATCH /api/companies/{companyId}/settings` rejects legacy `unitCapabilities` mutations with `409`; full Block/Miniapp governance must use the capability transaction API.
- Settings UI persists immediately per toggle and route.
- Event emission:
  - `UNIT_SURFACE_UPDATE` interaction event
  - optional follow-up outcome events by operation
- Profile migration requests use `profileMigration: { fromProfile?, toProfile, modules?, dryRun }`.
  - `dryRun: true` returns a profile migration diff without persistence.
  - `dryRun: false` persists a normalized v2 compatibility payload.
  - incompatible modules are surfaced as explicit blockers and module-level diffs.
- The settings Module Matrix is derived from the check-foundation registry and server preview response.
  - required modules are locked with plain-language lock reasons.
  - optional modules remain editable.
  - pending diffs appear after preview when server-effective modules differ from the draft.

### 7.5 Capability transaction flow (canonical)
1. Client sends `POST /api/companies/{companyId}/capabilities/transaction` with:
   - `mode: "preview" | "apply"`
   - `expectedVersion` for apply mode
   - optional `idempotencyKey`
   - block/module/miniapp payload
2. Server validates payload and normalizes to canonical v3 envelope.
3. `preview` returns effective projection + impact (`hiddenRoutes`, `blockedOperations`, `affectedMiniapps`) without persistence.
4. `apply` enforces optimistic concurrency and persists in one atomic write.
5. successful apply emits audit interaction + outcome events.
6. duplicate idempotency key replays same request safely; mismatched payload on same key returns conflict.

### 7.6 Local-to-Miniapp intelligence flow
1. Local runtime ingests or refreshes source intelligence for the Unit.
2. Destination mission policy selects ClassScout or Compare scope.
3. Mission run consumes Unit intelligence and creates destination candidates or review cards.
4. Operator reviews, approves, publishes, or requests recovery from Miniapp Ops.
5. Observability records freshness, failures, retries, blocked states, and successful outcomes.
6. Release evidence must prove this flow separately for ClassScout and Compare.

Legacy adoption rule:

- If real Miniapp destination content exists from before mission runs were introduced, do not weaken the proof gate.
- Adopt the legacy evidence into explicit mission lineage with `npm run backfill:destination-mission-lineage`.
- The adopted run must be visibly marked in metadata and must reference the original review card, outcome memory, workflow run, and candidate where available.
- This is a compatibility bridge only. New destination content should be created by daemon/materialized mission runs.

Local Compare bridge bootstrap:

- `npm run bootstrap:compare-local-proof -- --companyId <companyId>` creates explicit local proof evidence when no organic Compare destination instance exists yet.
- This is a development proof tool, not a production content source.
- The proof records are marked with `source: bootstrap-compare-local-proof`.
- Production readiness still requires Compare discovery/intelligence to produce real candidates, review cards, and publish outcomes.

Shared health contract:

- resolver: `src/lib/miniapp-intelligence-health.ts`
- API: `GET /api/companies/{companyId}/miniapp-health`
- optional query: `destinationKey=classscout|compare`
- observability field: `miniappIntelligenceHealth`

The contract reports:

- `enabled`
- `destinationActive`
- `localConnected`
- `freshnessState`
- `missionState`
- `reviewState`
- `publishState`
- `failureState`
- `retryState`
- `overallState`
- `blockers`
- `recoveryActions`
- `evidenceRefs`

### 7.4 Board CRUD flow

#### Create
1. Validate `companyId` and trimmed title.
2. Compute target column:
   - Use `payload.columnKey` when it matches the resolved surface columns.
   - Fall back to the first configured column for that surface when omitted or invalid.
3. Transaction:
   - create `BoardCard`
   - create matching `BoardItemState` with incremented rank.
4. Return item + `traceId`.

#### Move
1. Client sends `sourceColumn`, `destinationColumn`, `beforeId`, `afterId`.
2. Ensure balances on destination column if needed.
3. Compute rank from neighbor rows via `computeServerBoardRank`.
4. `upsert` `BoardItemState`.

#### Update
1. Title/description update via `PATCH`.
2. Merge provided metadata and priority if present.
3. Persist metadata state if record exists; otherwise initialize defaults in state.

#### Archive
1. Soft-delete by setting `BoardCard.archivedAt`.

## 8. API contracts (request/response)

### 8.1 `/api/companies/[companyId]/settings`
- `GET` response:
  - `id`, `name`, `allowedLanguages`, `unitCapabilities`, `unitCapabilitiesV2`.
  - `capabilitiesVersion`, `capabilitiesSource`, `capabilitiesEnvelopeVersion`.
  - `webapp.profile`, `webapp.modules`, `webapp.profileLabel`.
- `PATCH` request:
  - `allowedLanguages?: string[]`
  - `unitCapabilitiesV2?: { webappProfile, modules } | { schemaVersion: 2, payload: { v: 2, profile, modules } }`
  - `unitCapabilities` is intentionally rejected with `409 capability_transaction_required`.
- `PATCH` response:
  - updated company record + normalized `unitCapabilities`, `unitCapabilitiesV2`, and `webapp` contract.
- Auth:
  - membership required, admin role for modifications.

### 8.2 `/api/companies/[companyId]/nav`
- `GET` response:
  - `company`
  - `counts` + `features`
  - `webapp.profile`, `webapp.modules`, `webapp.profileLabel`, `webapp.route`
  - `webapp.routeTargets.classscout`
  - `normalizedCapabilities`
- Auth:
  - membership required.

### 8.5 `/api/classscout/landing`
- `GET` query:
  - `companyId`
- Response:
  - `destinationKey: "classscout"`
  - `companyId`
  - `liveListings.total/needsReview/published`
  - `reviewCards.total/pending/approved/rejected`
  - `learning.cards/published/failed/replayCandidates`
  - `missionControl.activeRuns/failedRuns/retryBacklog`
  - `routeTargets.review/ops/observability`
  - `fetchHealth.degraded` and source-level health rows
  - `entryPoints[]` with canonical/deep-link classification
- The legacy `/api/classscout/landing-summary` route remains available for existing UI consumers.
- Partial source failures must return degraded source health instead of crashing the whole landing surface.
- `/{companyId}/classscout` server-loads this summary and passes it to the GDS-only ClassScout operator home.
- Client refresh uses this canonical endpoint and keeps degraded-source detail visible.

### 8.6 `/api/classscout/refresh-lane`
- `POST /api/classscout/refresh-lane/sync`
  - request: `companyId`, optional `limit`
  - returns refresh candidates with `id`, `targetType`, `targetId`, `reason`, `freshnessScore`, `refreshAttempts`, `nextEligibleAt`, and `idempotencyKey`
- `POST /api/classscout/refresh-lane/tick`
  - request: `companyId`, optional `limit`
  - publishes approved ClassScout revision cards and drafts refresh revisions for eligible stale live listings
  - admin membership required
- Refresh lane ownership:
  - candidate selection is non-destructive
  - live records are not overwritten by the lane; refreshes create draft/revision cards for review and publish verification
  - failures return explicit status/error payloads and leave original live cards unchanged

### 8.7 `/api/destination-missions/runs/[id]/verification-tick`
- `POST` request:
  - `companyId`
  - `destinationKey: "classscout"`
  - optional `targetListingId`
  - optional `targetListingType: "provider" | "meetupGroup"`
  - optional `expectedTitle`
  - optional `expectedImageUrl`
  - optional `attemptsMax`
- Runtime behavior:
  - polls ClassScout public listings through the existing live-listings bridge
  - persists `publishVerification` and bounded `publishVerificationHistory` in mission metadata
  - moves a run to `PUBLISHED_VERIFIED` only after positive public evidence
  - marks unresolved, schema-mismatched, or image-invalid verification as `FAILED_RECOVERABLE`
- Status values:
  - `queued`
  - `verified`
  - `not_found`
  - `schema_mismatch`
  - `image_invalid`
  - `timeout`
- Auth:
  - admin membership required

### 8.4 `/api/companies/[companyId]/capabilities/transaction`
- `POST` request:
  - `mode: "preview" | "apply"`
  - `expectedVersion: string` (required for apply)
  - `idempotencyKey?: string`
  - `payload`:
    - `blocks: Partial<Record<BlockKey, { enabled: boolean }>>`
    - `modules?: Partial<Record<ModuleKey, boolean>>`
    - `miniapps?: Record<string, { enabled: boolean }>`
- `POST` success response:
  - `ok`
  - `mode`
  - `version`
  - `effective.enabledBlocks[]`
  - `effective.enabledModules[]`
  - `effective.enabledMiniapps[]`
  - `warnings[]`
  - `impact.hiddenRoutes[]`
  - `impact.blockedOperations[]`
  - `impact.affectedMiniapps[]`
- Conflict responses:
  - `409` for stale `expectedVersion`
  - `409` for idempotency key reuse with different payload
- Validation response:
  - `422` with deterministic field-level validation errors
- Auth:
  - membership + admin role required

### 8.3 `/api/board-items`
- `GET` query: `companyId`, optional `boardKey`, optional `module`, optional `traceId`
  - resolves `boardKey` or `module` through `board-adapters` and supports shared read access across cross-surface keys.
- `POST` body: `companyId`, `boardKey`, `title`, optional metadata
- `PATCH` body:
  - move: `id`, `destinationColumn`, `beforeId`, `afterId`
  - update: `id`, `title`, `description`, metadata
- `DELETE` query: `companyId`, `id`
- Mutation endpoints are enforced as read-only for non-`unitBoard` surfaces.
- Error envelope when persistence failure:
  - `error`, `detail`, `reasonCode`, `retryable`, `retryAfterMs`, `traceId`

## 9. Pseudo-code

### 9.1 Capability resolution
```ts
// Input: workerConfig + destination flags
const capabilities = resolveUnitCapabilities({
  workerConfig: company.workerConfig,
  hasClassScoutDestination: Boolean(classScoutInstance),
  hasCompareDestination: Boolean(compareInstance),
});

// Output:
// { profile: 'CLASSSCOUT'|'COMPARE'|'NONE', modules: Record<module, boolean> }
```

### 9.2 Module filtering
```ts
const navItems = staticItems
  .concat(profileRoute)
  .filter((item) => capabilities.modules[item.key] !== false);
```

### 9.3 Board rank request validation
```ts
function validateBoardRequest(payload) {
  if (!payload.companyId) throw BadRequest;
  if (payload.title && !String(payload.title).trim()) throw BadRequest;
  if (payload.priority !== undefined && !isFiniteNumber(payload.priority)) throw BadRequest;
  if (payload.dueDate && isInvalidDate(payload.dueDate)) throw BadRequest;
}
```

### 9.4 Failure and retry envelope
```ts
if (isQuotaBlocked(error)) {
  return http503({
    error: "MongoDB Atlas storage quota blocked writes",
    reasonCode: "atlas_storage_quota_blocked",
    retryable: true,
    retryAfterMs: 1800000,
    traceId,
  });
}
```

## 10. UI/UX state model and accessibility

### 10.1 Global UI state rules
- Shell and nav always reflect capability state from nav API.
- Module routes hide when disabled by `unitModules` false.
- Counts update on a periodic poll (`WEBAPP_SUMMARY_CLIENT_POLL_MS`).

### 10.2 Unit board UI state model
- loading: full skeleton until first fetch.
- loaded empty state: explicit `drop here` visual.
- success: rendered columns and cards.
- boardError: non-blocking notice with retry options.

### 10.3 Accessibility requirements
- All controls with icon-only behavior need accessible labels.
- Announce errors via notices and notifications.
- Drag/drop path includes Keyboard sensor plus pointer sensor.
- Focus returns after close/open actions; modal actions provide close and submit labels.
- Column headers should be deterministic reading order.

## 11. Observability and instrumentation

### 11.1 Board endpoint telemetry
- request/response per verb
- status by verb and boardKey
- latency buckets
- persistence failure by reason code
- load refresh frequency after write errors

### 11.2 Capability telemetry
- observability snapshot now includes `capabilityTransactions` summary built from local audit events:
  - `appliedLast24h`
  - `previewsLast24h`
  - `conflictLast24h`
  - `validationFailuresLast24h`
  - `latestApplyAt`
  - `recentApplies[]` with actor, expectedVersion, and impact counters
- transaction API emits explicit interaction event types for telemetry:
  - `CAPABILITY_TRANSACTION_PREVIEW`
  - `CAPABILITY_TRANSACTION_VALIDATION_FAILED`
  - `CAPABILITY_TRANSACTION_CONFLICT`
  - `CAPABILITY_TRANSACTION_APPLY`
- successful apply emits outcome type:
  - `UNIT_CAPABILITIES_UPDATED`
- profile resolution source (`auto` vs `custom`)
- unknown profile/mismatch count
- nav payload build time

### 11.3 Local AI collaboration telemetry
- projection freshness age per company
- projection staleness on nav/dashboard read
- destination active run counts
- queue starvation and retry pressure from local worker sources

### 11.4 Logging
- classify and emit `Retry-After` on quota failures in board API.
- add `X-Board-Trace-Id` in every board response.

## 12. Retries, timeouts, and failure policy

### 12.1 Board write policy
- For quota/blocking errors:
  - return structured retry metadata
  - show user action message with retry horizon
  - do not fall back to hidden writes.

### 12.2 Client retry policy
- Create/update/move use optimistic updates.
- On failure: rollback optimistic row and refetch.
- On success: reload once to re-sync server row shape.

### 12.3 Profile/API failure policy
- nav/settings fallback to `NONE` profile if resolution fails.
- board API failures should be visible and not silently ignored.

### 12.4 Timeout strategy
- Use route-level defaults and avoid blocking operations on render.
- board polling use non-store/no-store fetch.

## 13. Rollback and recovery

- `unitCapabilities` toggles are reversible by settings updates.
- Board operations are transactional on create/update state pair.
- Archive operation is reversible only through manual admin-level backfill or DB repair tooling.
- If rank consistency drifts, backend rebalance path recomputes ranks before move writes.

### 13.1 Disaster recovery notes
- If Atlas becomes write-blocked:
  - board and feature writes must preserve behavior without silent data loss
  - keep read-only mode surfaced in UI and rely on local worker to continue own operations where possible
- If nav/profile API fails:
  - keep shell operational
  - route fallback to `NONE` and safe surfaces.

## 14. Testing strategy

### 14.1 Unit tests
- `resolveUnitCapabilities` permutations for destination-only, override-only, combined and invalid payloads.
- write-path normalization and validation for malformed module booleans / unsupported profile values.
- rank and ordering helpers (`sortBoardRecords`, `moveBoardItem`, `computeRankBetween`, `computeServerBoardRank`).

### 14.2 API tests
- `/api/board-items`:
  - 400 validation
  - unauthorized access
- move/rebalance correctness
- archive soft-delete behavior
- quota failure response envelope mapping.

### 14.3 Integration tests
- `getDashboardInitialData` profile fallback and module assignment.
- webapp profile switch (NONE->CLASSSCOUT->COMPARE).
- nav module gating and deep-link handling.

### 14.4 E2E tests
- create card visible after successful write.
- move card across columns.
- edit, delete, filter, search.
- compare and classscout profile route rendering.
- disabled module not visible in nav.

### 14.5 Regression tests (must-have)
- quota-saturated Atlas write simulation
- local audit DB disabled mode
- stale `BoardItemState` + existing `BoardCard` mismatch
- local runtime projection staleness window with fallback.

## 15. Security and governance

- Admin role required to patch capability config.
- All board routes require membership verification.
- Inputs sanitized with explicit trim and type coercion.
- No direct DB writes from client.

## 16. Block-based surface composition

Business-level Block model:

- **Checklist Block** -> data, topics, goals, review, knowmore, analytics, tactical, checklist, pipeline as needed
- **Sales Block** -> data, knowmore, analytics, pipeline, sales, review as needed
- **Project Block** -> Project Board only; no intelligence lifecycle by default
- **Miniapp Block** -> Miniapp Ops, missions, review cards, publish/verify/maintenance, plus required supporting Modules

Current profile presets:
- NONE preset: core modules mostly on, content OFF
- CLASSSCOUT preset: class-specific modules ON/OFF as curated
- COMPARE preset: tailored reduced module set

Current profile presets are compatibility shortcuts. Future work should model Block enablement directly, then derive route and Module availability from Blocks.

## 17. Cross-surface adapter model for Miniapps

### 17.1 Miniapp Ops surface contract
Any future Miniapp Ops surface must:
- expose a dedicated root route `/{companyId}/<surface>`
- receive `companyId` only (server obtains all other context)
- remain a separate Block surface from Checklist, Sales, and Project
- keep navigation optional and capability-aware
- operate the public Miniapp without being the public Miniapp itself

### 17.2 Data sources
- read from server-projected contract or destination-specific service endpoints.
- avoid direct writes into Atlas when route is informational.
- write operator actions through existing intents/events.

## 18. Deployment and execution order

### 18.1 Phase A - foundation hardening
1. Freeze profile/module contract and confirm normalization functions are deterministic.
2. Add end-to-end type-safe schema contract for nav/settings payload.
3. Add tracing and failure envelope contract tests.

### 18.2 Phase B - board reliability
1. Keep board API boardKey/column enforcement explicit.
2. Add client-side move retry backoff for transient 503/timeout.
3. Keep optimistic cache reconciliation deterministic.
4. Keep failed optimistic mutations visible with explicit sync-state until manual recovery succeeds.

### 18.3 Phase C - control-plane completion
1. Keep explicit deep-link fallback behavior on module-guarded routes (route-level checks already added in each surface).
2. Add operational telemetry dashboards for profile drift and module mismatch.
3. Add incident runbook for quota and projection-stale states.

### 18.4 Phase D - generalization
1. Generalize board contract to accept additional boardKeys once other blocks require.
2. Add Block adapter docs for each future Miniapp.
3. Expand GDS adoption in all newly added surfaces.

## 19. Edge cases
- Destination exists but profile manually overridden to another value:
  - effective profile from `unitCapabilities` takes precedence, destination used only as default.
- Webapp route typed for disabled module:
  - should show controlled fallback and nav-disabled indicator.
- Board move with invalid neighbor IDs:
  - server reflows around null neighbors and writes bounded rank.
- Rapid reorder bursts:
- client optimistic state is reconciled with server load.
- Local storage failures:
  - audit writes degrade without blocking core board operations.

## 20. Operational behavior

### Development
- enable `BOARD_ITEMS_TRACE=1` only when diagnosing.
- frequent `load` on board after mutation is acceptable.

### Production
- keep trace headers low overhead.
- rely on structured retry responses and user-visible notices.
- avoid feature flags that change payload contracts at runtime.

## 21. Current implementation status

Shipped today:
- profile resolution and settings mutation in `src/lib/intelligence-unit-capabilities.ts`
  - versioned capability envelope (`schemaVersion` + `payload.v`) with legacy drift handling.
- nav capability projection in `src/app/api/companies/[companyId]/nav/route.ts`
  - capability contract fields include `capabilitiesVersion` and `capabilitiesSource` for drift visibility.
- canonical capability transaction endpoint in `src/app/api/companies/[companyId]/capabilities/transaction/route.ts`
  - preview/apply contract, deterministic validation, optimistic concurrency, idempotency replay guards
- root route dispatch in `src/app/[companyId]/page.tsx`
- shared board APIs in `src/app/api/board-items/route.ts`
- shared board component + project board client in `src/components/board/shared-board.tsx`, `src/app/[companyId]/unit-board/unit-project-board-client.tsx`
- class-specific landing summary contract and UI for ClassScout
- local audit separation primitives in `src/lib/local-audit-db.ts`, `src/lib/audit-ledger.ts`

Remaining hardening (not fully implemented today):
- standardized cross-surface board adapters for non-project future boards
- operational dashboards for module drift and deep-link mismatch events
- Local-to-Miniapp intelligence health proof for ClassScout and Compare
- recovery behavior when Local is down, stale, or not feeding destination content

Implemented in this iteration:
- board mutation robustness:
  - bounded client retry on retryable board write/move failures
  - request timeout guard for board API reads/writes
  - non-lossy create/update/move/archive error handling with visible sync-state
- quota persistence classification broadened to reduce false 500 behavior and improve incident detection

### Mission State Hardening

ClassScout and Compare mission runs now use an explicit transition map plus JSON metadata audit rather than ad hoc state writes. Each transition records:
- `missionTransitionAudit`
- `recoveryHint`
- `nextAction`
- `operatorMessage`
- `terminal`

Terminal states are `PUBLISHED_VERIFIED`, `FAILED_TERMINAL`, and `EXHAUSTED`. Recoverable states must expose an operator action such as `retry`, `resume`, `reselect_policy`, or `manual_force_stop`.

Remote mission steps are bounded by runtime timeouts:
- soft timeout: 45 seconds
- hard timeout: 90 seconds

Timeouts classify as recoverable `504` step failures and flow through the same attempt advancement and retry-budget rules as extraction, scoring, or preparation failures.

### Publish Verification And Catalog Orchestration

Mission control summary includes `verificationHealth`, `trackHealth`, and `nextRetryAction`. Publish is not considered complete until public verification is classified. Verification records are surfaced from mission metadata and failure codes, including:
- `verified`
- `queued`
- `not_found`
- `schema_mismatch`
- `image_invalid`
- `timeout`

The GDS-only mission control surface renders publish verification health, recent verification records, and a single next recovery action with non-color-only status text and polite live-region updates.

### Correction-To-Policy Loop

The destination learning summary now emits approval-required `policySuggestions` from review decisions and outcome memories. Suggestions are generated from repeated signals such as image failures, missing evidence, scarcity threshold misses, and publish verification failures.

Policy suggestions are advisory until an operator approves them; raw review decisions and outcome memories remain immutable learning evidence.

## 22. Reference file map

- `/src/lib/intelligence-unit-capabilities.ts`
- `/src/lib/server-company-page-data.ts`
- `/src/app/[companyId]/page.tsx`
- `/src/app/api/companies/[companyId]/settings/route.ts`
- `/src/app/api/companies/[companyId]/nav/route.ts`
- `/src/app/api/companies/[companyId]/capabilities/transaction/route.ts`
- `/src/app/api/board-items/route.ts`
- `/src/app/[companyId]/unit-board/unit-project-board-client.tsx`
- `/src/components/board/shared-board.tsx`
- `/src/components/classscout-home.tsx`
- `/src/components/compare-home.tsx`
- `/src/lib/local-audit-db.ts`
- `/src/lib/audit-ledger.ts`
- `/src/app/[companyId]/observability/page.tsx`
- `/src/lib/miniapp-intelligence-health.ts`
- `/src/lib/destination-missions.ts`
- `/src/lib/destination-mission-runner.ts`
- `/src/lib/destination-workflow-runtime.ts`
- `/src/lib/destination-learning.ts`
- `/src/components/destination-mission-control.tsx`
- `/src/components/destination-learning-panel.tsx`
- `/src/app/api/companies/[companyId]/miniapp-health/route.ts`
- `/scripts/test-capability-transaction-contract.mjs`
- `/scripts/test-miniapp-health-contract.mjs`
- `/scripts/test-classscout-runtime-quality-contract.mjs`
- `/scripts/refresh-company-intelligence-snapshot.mjs`
- `/scripts/backfill-destination-mission-lineage.mjs`
- `/scripts/bootstrap-compare-local-proof.mjs`
- `/scripts/verify-ui-alignment-proof-gate.mjs`
- `/docs/UI_ALIGNMENT_RELEASE_PROOF_GATE.md`
- `/src/lib/persistence-failures.ts`

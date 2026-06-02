# Webapp Boundary Contract

## Purpose

The Webapp is a UI and user-intent surface. It must not become an alternate business logic runtime.

Canonical flow:

```text
Local AI / CHECK workers -> calculate, decide, aggregate, rank, score -> write Atlas read models -> Webapp reads and renders
```

The Webapp may write user intent, but it must not execute business decisions.

## Authority Rules

### Webapp May Read

- Stable Atlas read models and projections.
- Lean board/card summary projections.
- Card detail projections fetched on demand.
- Read-only operational snapshots.
- Projection freshness, version, status, and source run metadata.

### Webapp May Write

- User annotations.
- User-authored edits.
- Intent records.
- Worker commands.
- Repair requests.
- Queue receipts.
- Manual lane/order overrides when the action is explicitly user-authored.

### Webapp Must Not Do

- Calculate card, lane, module, block, unit, chart, or miniapp truth from raw records.
- Score, classify, rank, promote, evaluate, or decide card lifecycle state.
- Aggregate charts from raw events.
- Query multiple collections to assemble business state for one UI task.
- Use fallback raw queries to replace missing projections.
- Return full card detail payloads for board summaries.
- Execute Local AI worker logic from API routes.

## Projection Families

Atlas must hold UI-ready projections for:

- Company navigation.
- Company dashboard.
- Units.
- Blocks.
- Modules.
- Miniapps.
- Boards.
- Charts.
- Card summaries.
- Card details.
- Operations.
- Health and observability.

Each projection must include:

- `companyId`
- `projectionType`
- `version`
- `generatedAt`
- `sourceRunId`
- `inputWatermark`
- `recordCount`
- `checksum`
- `freshness`
- `errorState`

## Read API Contract

Read APIs must return projection data only.

Allowed behavior:

- Validate request and membership.
- Read one projection or read-model family.
- Return projection metadata and payload.
- Return stale/missing states when projection is unavailable.

Disallowed behavior:

- Recalculate counts from raw collections.
- Import scoring, ranking, promotion, classification, discovery, research, or worker runtime modules.
- Fetch raw child records to build board/chart/card summaries.
- Apply different filters than the projection writer.

## Intent API Contract

Intent APIs must only:

1. Validate request and membership.
2. Sanitize user-authored fields.
3. Write a bounded intent/command/event.
4. Enqueue Local AI work.
5. Return a receipt.

Intent APIs must not execute worker business logic.

## Board/Card Contract

Board list payloads must be lean.

Allowed board summary fields:

- `id`
- `publicId`
- `title`
- `subtitle`
- `lane`
- `sortOrder`
- `displayScore`
- `status`
- `activityState`
- `badges`
- `updatedAt`

Card modals must fetch detail on demand by card ID.

Card detail payloads may include:

- Body/details.
- Evidence.
- Linked cards.
- Feedback.
- Contact info.
- Action history.
- Source trace.

## Missing Projection Behavior

When a projection is missing or stale, the Webapp should show:

- Last known projection if available.
- Freshness/stale warning.
- Worker rebuild queued/running state.
- Empty or unavailable state if no projection exists.

The Webapp must not silently replace the projection by calculating raw truth.

## Enforcement

Boundary enforcement is staged:

1. Report-only audit.
2. Reference refactor for sales board.
3. Guard tests for no Webapp business imports.
4. Guard tests for lean board payloads.
5. Guard tests for projection-only counts.
6. CI-required boundary tests.


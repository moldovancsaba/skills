# Surface Projection Read Models LLD

Status: implemented foundation slice, version `0.17.3`.

## Purpose

Surface projections move repeatable Webapp display work out of client components and into durable, Atlas-backed read models. A surface projection is a normalized DTO that a frontend view can render directly with GDS components, without recomputing business state, freshness, actions, or filter metadata in the browser.

## Architecture

- `CompanySurfaceProjection` stores one read model per Unit, surface key, and contract version.
- `CompanySurfaceItemProjection` stores item-level payloads for surfaces that need ordered lanes, search, filters, or later incremental updates.
- `GlobalSetting.company_surface_projection_refresh_state` stores the dirty refresh queue, retry metadata, and recent outcomes.
- `src/lib/surface-projections.ts` owns TypeScript contracts and Webapp/API helpers.
- `scripts/lib/surface-projections.js` owns runtime builders used by CHECK Local snapshot workers.
- `scripts/snapshot-worker.js` drains dirty surface refreshes next to existing projection and intelligence snapshot maintenance.

## Runtime Flow

1. A mutation or repair path calls `markCompanySurfaceProjectionDirty`.
2. The dirty queue deduplicates by `companyId`, `surfaceKey`, and `contractVersion`.
3. The snapshot worker calls `refreshDirtyCompanySurfaceProjections`.
4. A registered builder creates a deterministic `SurfaceReadModel`.
5. The runtime upserts the aggregate projection and item projections with checksums.
6. Webapp reads use `GET /api/companies/:companyId/surfaces/:surfaceKey`.
7. Frontend actions use `POST /api/companies/:companyId/surfaces/:surfaceKey/actions` and receive receipts.

## Contracts

The projection payload contains:

- `surfaceKey`, `contractVersion`, `companyId`, `generatedAt`, `sourceRunId`, and `inputWatermark`.
- `summary` for precomputed surface-level metrics and labels.
- `columns`, `filters`, and `actions` for direct UI rendering.
- `items` for ordered/cards/table/queue rendering.
- `states` for empty, loading, stale, degraded, and permission behavior.
- `observability` for trace identifiers, warnings, and source freshness.
- `checksum` for deterministic change detection.

Current registered runtime builder:

- `company.dashboardSummary`: high-value Unit dashboard summary derived from existing webapp projections.

Current local operator surface:

- `localAi.commandCenter`: server-composed Local AI runtime command-center DTO, exposed through `/api/local-ai/command-center`.

## APIs

`GET /api/companies/:companyId/surfaces/:surfaceKey?contractVersion=1`

- Requires Unit membership.
- Returns `{ ok: true, projection }`.
- If the durable projection does not exist, returns a typed missing projection state instead of making the frontend infer failure behavior.

`POST /api/companies/:companyId/surfaces/:surfaceKey/actions`

- Requires Unit membership.
- Body: `{ action: string, projectionRevision?: string, payload?: object }`.
- Supports `refreshProjection`.
- Returns action receipts with `ACCEPTED`, `REJECTED`, or `CONFLICT`.
- `CONFLICT` includes the next projection when the caller sends a stale revision.

`GET /api/local-ai/command-center?limit=40`

- Allowed on localhost for operator use; non-local access requires super-admin authorization.
- Composes status-server health and lane events server-side.
- Returns a read-model projection plus `compat` payloads used by the current GDS Local AI page during transition.

## Operational Behavior

- Refresh retries use exponential backoff with a bounded five-minute ceiling.
- Failed builders persist retry metadata and are visible in snapshot-worker progress as `surfaceProjectionFailures`.
- Dirty queue drain limits prevent one surface family from starving snapshot maintenance.
- Missing builders are recorded as failed refresh attempts, not silently dropped.
- Reads never mutate projection state.
- `refreshProjection` only marks dirty and returns a receipt; CHECK Local performs the rebuild.

## Rollback And Recovery

- Frontend rollback can continue using legacy endpoints while the `compat` bridge is present.
- Runtime rollback can stop draining surface projections by reverting the snapshot-worker import/call; existing projection collections are passive.
- Atlas index creation is additive. Existing duplicate legacy `ChecklistTask.publicId` data can block `prisma db push`, so this delivery created and verified the new projection indexes directly.
- If a projection is corrupt or stale, mark it dirty and let the snapshot worker rebuild it from source projections.

## Accessibility And UX

- UI work remains inside the existing GDS-only boundary.
- Local AI page polling was reduced from two frontend polling loops to one server-composed endpoint.
- Chart frames now render only after real pixel dimensions exist, preventing zero-size chart warnings and layout instability.
- Surface DTOs carry UI states so frontend views can render loading, empty, stale, conflict, and degraded states consistently.

## Testing

Required checks:

- `npm run test:surface-projection-contract`
- `npm run test:local-lane-events`
- `npm run audit:gds-boundary`
- `npm run audit:docs`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:runtime-hardening`
- `npm run test:runtime-chaos`
- `npm run build`

Browser smoke:

- `/local-ai` on localhost renders the Local AI Mission Control page.
- `/api/local-ai/command-center` returns `ok: true` and live runtime summary.
- Timestamp-bounded browser console check has no new warnings or errors after the chart-frame fix.

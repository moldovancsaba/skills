# CHECKLIST Webapp Read Model LLD

This document defines the low-level design for fast product reads in the online webapp.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)

## 1. Problem Statement

The current system has two real operational constraints:

- the local AI host machine is memory-fragile under sustained Ollama residency and worker load
- the online webapp read path is still too expensive for what should feel instant

The second problem is self-inflicted by architecture:

- the webapp still performs too many live count queries and top-task reads on hot routes
- company list and dashboard routes have been assembling pages from many small database queries
- navigation refresh has been polling a heavier dashboard route instead of a dedicated lightweight summary surface

That is the wrong contract for a system that already runs a continuous background intelligence layer.

## 2. Target Principle

The local AI system must prepare webapp-ready product read models ahead of time.

The online webapp must primarily:

- read prepared projections
- render them quickly
- record user interaction and operator intent

The online webapp must not:

- recompute large company summaries on page load
- act as a parallel analytics engine
- trigger queue synchronization or worker-style refresh logic from hot routes

## 3. Truth Split

Two kinds of truth exist and must stay separate:

### 3.1 Product / user truth

This is what end-user product routes should read first:

- company summary counts
- sidebar counts
- dashboard metric cards
- top checklist tasks
- tactical summary counts
- analytics history summaries

This truth should come from persisted read models.

### 3.2 Operator / runtime truth

This is what local operator surfaces should read:

- worker stage and current task
- queue pressure
- memory governor state
- runtime verification status
- deferred/decomposed/starved job state

This truth belongs to `/local-ai`, runtime endpoints, and observability-oriented surfaces.

## 4. Read Model Contract

The canonical per-company product read model lives on `IntelligenceSnapshot.webappProjection`.

Minimum contract:

- `version`
- `generatedAt`
- `counts`
  - `sources`
  - `files`
  - `topics`
  - `flashcards`
  - `goals`
  - `tacticalCount`
  - `checklistCount`
  - `reviewCount`
  - `pipelineJobs`
- `navCounts`
  - `data`
  - `topics`
  - `knowmore`
  - `goals`
  - `review`
  - `checklist`
  - `tactical`
  - `pipeline`
- `topTasks`
- `planningSummary`
  - `laneCounts`
  - `tacticalCount`
  - `checklistCount`

Rules:

- `checklistCount` is a subset of `tacticalCount`
- `tacticalCount` must never render below `checklistCount`
- projection payloads must be normalized through one shared adapter before webapp use
- projection writes belong to the local AI side, not the online app hot path

## 5. Projection Ownership

Projection ownership is split cleanly:

### 5.1 Local AI ownership

The local AI side owns:

- computing company summary counts
- computing top checklist tasks for product read surfaces
- refreshing `IntelligenceSnapshot`
- refreshing `webappProjection`

Current implementation owner:

- `scripts/lib/intelligence-snapshot.js`
- `scripts/snapshot-worker.js`

### 5.2 Webapp ownership

The webapp owns:

- reading `webappProjection`
- rendering snapshot-backed product pages
- falling back safely if projection is missing
- keeping operator/runtime pages separate from product pages

Current implementation adapters:

- `src/lib/webapp-projection.ts`
- `src/lib/server-company-page-data.ts`

## 6. Freshness And Fallback Rules

The webapp must be snapshot-first.

Default behavior:

1. read `webappProjection`
2. if projection exists, render it
3. if projection is missing, use a bounded lightweight fallback
4. do not fan out into broad live recomputation by default

Freshness rule:

- slightly stale product projections are acceptable if they preserve fast page loads
- projection freshness repair belongs to the local AI side
- the online app may overlay a few cheap dynamic values where justified
  - example: queue active job total from persisted observability summary

Forbidden fallback pattern:

- per-company `Promise.all` fan-out of many count queries on hot routes
- broad live top-task recomputation on every dashboard request

## 7. Shipped First Slice

The first slice of this architecture is now:

- `IntelligenceSnapshot.webappProjection` persistence
- snapshot-backed company dashboard reads
- snapshot-backed company nav reads
- snapshot-backed company list metrics
- snapshot-backed planning summary reads for tactical and checklist surfaces
- projection freshness telemetry on dashboard, tactical, and checklist surfaces
- shared projection normalization in `src/lib/webapp-projection.ts`
- touched-company projection dirty queue drained by `snapshot-worker`
- targeted projection repair after successful company work lands

Hot routes improved in this slice:

- `GET /api/companies`
- `GET /api/companies/[companyId]/dashboard`
- `GET /api/companies/[companyId]/nav`
- server-side company dashboard bootstrap in `src/lib/server-company-page-data.ts`

## 8. Remaining Work

The first slice is not the end state.

Still required:

1. larger analytics and card-detail reads audited to avoid hot-path fan-out
2. broader freshness visibility where operators actually need it
3. stricter projection backfill/repair guarantees for cold-start environments

## 9. Why This Matters Operationally

This is not only a performance project.

It is also a runtime-stability project:

- the machine is already memory-fragile
- expensive live webapp reads compete with the same shared database and background maintenance work
- moving product reads to prepared projections reduces pressure on the whole system

Prepared reads are therefore part of the 24/7 reliability strategy.

## 10. Acceptance Criteria

This architecture is considered healthy when:

1. company list pages do not perform per-company live count fan-out
2. dashboard and nav reads are projection-first
3. product page loads remain fast even while the local AI runtime is active
4. the webapp no longer behaves like a second analytics engine
5. projection freshness and fallbacks are documented and observable
6. touched-company work triggers fast targeted projection repair instead of waiting only for broad snapshot sweeps

## 11. GitHub Breakdown

The active delivery breakdown for this design is:

- umbrella: webapp read-model hardening
- child issue: company projection contract and snapshot persistence
- child issue: company list projection-first reads
- child issue: company dashboard and nav projection-first reads
- child issue: tactical/checklist projection reads plus freshness telemetry
- child issue: projection repair and touched-company invalidation

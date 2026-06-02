# check Webapp Read Model LLD

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

### 3.3 Miniapp truth

Some Webapp routes are Miniapp Ops homes rather than generic Unit Homes or Block Homes.

Current shipped case:

- `/{companyId}/classscout`
- `/{companyId}/compare`

These routes must follow a bounded landing-summary contract:

- one canonical route
- one canonical API summary contract
- deterministic `ready`, `empty`, `partial`, and `fatal` states
- explicit ownership of launch actions into subordinate destination workflows
- clear separation between the Webapp-side Miniapp Ops surface and the public Miniapp

Current shipped ClassScout landing contract:

- route: `/{companyId}/classscout`
- API: `GET /api/classscout/landing?companyId=...`
- compatibility API: `GET /api/classscout/landing-summary?companyId=...`
- server contract owner: `src/lib/classscout-landing.ts`
- primary UI consumer: `src/components/classscout-home.tsx`

Allowed slices in that contract:

- Miniapp review/learning summary
- mission-control summary
- live-listing summary
- unit project-board summary

Forbidden pattern:

- each Miniapp tile or panel issuing its own page-level summary fetch on the hot landing path
- routing operators into a generic Unit tile dashboard when the intent is Miniapp Ops work

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
- `homeCharts`
  - `data`
  - `topics`
  - `goals`
  - `review`
  - `knowmore`
  - `tactical`
  - `checklist`
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
- snapshot-backed Unit workspace reads
- snapshot-backed company nav reads
- snapshot-backed company list metrics
- snapshot-backed planning summary reads for tactical and checklist surfaces
- projection freshness telemetry on dashboard, tactical, and checklist surfaces
- shared projection normalization in `src/lib/webapp-projection.ts`

## 8. Block-First Nav Contract

The company nav surface now supports a Block-first capability contract in addition to legacy profile/module fields.

Route:

- `GET /api/companies/{companyId}/nav`

Webapp capability payload must include:

- `webapp.enabledBlocks`
- `webapp.enabledModules`
- `webapp.enabledMiniapps`
- `webapp.effectiveSource`
- `webapp.effectiveWarnings`

Block summary route:

- `GET /api/companies/{companyId}/blocks/summary`
- returns per-Block `enabled`, `readiness`, `health`, module set, action hints, and stale/freshness metadata

Compatibility rules:

- legacy fields (`webapp.profile`, `webapp.modules`) remain readable during migration
- Webapp consumers may use legacy fields as fallback only
- route/module access checks should prefer effective enabled modules where available
- touched-company projection dirty queue drained by `snapshot-worker`
- targeted projection repair after successful company work lands
- server-side Unit workspace bootstrap from prepared projection data instead of a post-mount dashboard fetch
- server-side home/Webapp home bootstrap from prepared company data instead of a post-mount `/api/companies` waterfall
- company summary-card charts embedded into `webappProjection.homeCharts` so the home route does not need heavy `analyticsHistory` reads
- shell identity bootstrap from the signed session cookie so the authenticated sidebar does not wait for a post-mount identity fetch
- home summary charts deferred behind viewport-driven lazy rendering so the landing page does not hydrate every mini chart immediately
- lighter first dashboard payload by moving non-critical identity/member reads off the critical response

Hot routes improved in this slice:

- `GET /api/companies`
- `GET /api/companies/[companyId]/dashboard`
- `GET /api/companies/[companyId]/nav`
- server-side home bootstrap in `src/lib/server-home-page-data.ts`
- server-side Unit workspace bootstrap in `src/lib/server-company-page-data.ts`
- server-side Knowmore bootstrap in `src/lib/server-knowmore-page-data.ts`
- database-level Knowmore paging/filtering in `src/lib/flashcards.ts` and `GET /api/knowmore`
- server-side datacard bootstrap in `src/lib/server-company-page-data.ts` via `/:companyId/data`
- server-side topics bootstrap in `src/lib/server-topics-page-data.ts` via `/:companyId/topics`
- server-side goals bootstrap in `src/lib/server-goals-page-data.ts` via `/:companyId/goals`
- bounded file paging in `GET /api/data-files` so the datacard route no longer pulls the full file corpus on first load
- canonical ClassScout landing-summary contract and destination home route so ClassScout-enabled units no longer fall back to the generic company tile dashboard
- canonical Compare landing-summary contract and destination home route so Compare-enabled units have a first-class operational home state
- canonical Company home route now prioritizes effective enabled Miniapps (`classscout`, `compare`) before legacy profile fallback

## 7.1 Knowmore pagination contract

Knowmore is now part of the same read-model discipline.

Required behavior:

- the first Knowmore screen must be server-bootstrapped
- Knowmore list reads must page in the database, not by loading the full company corpus and slicing in memory
- search, intelligence-type filtering, kind filtering, and hashtag filtering must apply to the full company corpus
- predictive search quality must not degrade when only one page of results is visible

Forbidden pattern:

- load all flashcards for the company
- serialize the entire corpus
- then slice the array in route code or client code

That pattern is exactly what made the Knowmore route feel much slower than it should.

## 7.2 Follow-up audit result

The first broad sibling audit after Knowmore found three surfaces in the same architectural family:

- Knowmore
- Datacards
- Topics

Shipped status:

- Knowmore: fixed
- Datacards: fixed bootstrap path to use the existing server loader instead of the older client-init page
- Topics: fixed bootstrap path so the page no longer loads the full company list just to resolve one company shell

Remaining caution:

- not every large corpus route is fully paginated yet
- any future corpus-heavy surface must be checked against the same rule before it is treated as production-ready

## 8. Delivered Hardening Follow-Through

The first slice is now backed by the remaining support work that keeps it trustworthy in production:

1. projection coverage is visible to operators on `/local-ai`
2. `snapshot-worker` performs bounded cold-start projection backfill before slower broad refresh sweeps
3. touched-company projection repair remains the fast path after productive work
4. authenticated dashboard routes expose `Server-Timing` and named profiling steps
5. a dedicated CLI exists for repeatable live authenticated profiling instead of ad hoc browser guessing

## 8.1 Authenticated route profiling contract

The deployed authenticated product routes must be measurable without ad hoc debug patches.

Current profiling support:

- `GET /api/companies`
- `GET /api/auth/session`
- `GET /api/companies/[companyId]/dashboard`
- `GET /api/companies/[companyId]/nav`
- `GET /api/companies/[companyId]/planning-summary`

Profiling behavior:

- every profiled response emits `Server-Timing`
- if `?profile=1` is present, the JSON payload also includes a `profile` object with total time and named steps
- if header `x-checklist-profile: 1` is present, profiling is also exposed

Purpose:

- identify whether slowness is in auth/session, membership checks, projection reads, or fallback query paths
- keep future dashboard work evidence-driven instead of intuition-driven

Operational tool:

- `npm run profile:webapp -- --base-url https://checklist.sovereignsquad.com --session-token <token>`
- or provide a raw cookie string through `CHECKLIST_PROFILE_COOKIE`

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
7. the first dashboard response is projection-backed and does not require a post-mount summary fetch to become useful

## 11. GitHub Breakdown

The active delivery breakdown for this design is:

- umbrella: webapp read-model hardening
- child issue: company projection contract and snapshot persistence
- child issue: company list projection-first reads
- child issue: Unit workspace and nav projection-first reads
- child issue: tactical/checklist projection reads plus freshness telemetry
- child issue: projection repair and touched-company invalidation

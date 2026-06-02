# Webapp Boundary Implementation Plan

## Objective

Make every unit, block, module, chart, card, board, and miniapp consume canonical Atlas read models instead of recalculating business truth in the Webapp.

## Current Findings

Last audit report: `logs/webapp-boundary-audit.json`.

Resolved in the current delivery wave:

- `HARDCODED_UNGATED_UI_SURFACE` is now `0`.
- Company dashboard tiles/charts/action sections are gated by `enabledModules`.
- Home/company chooser tiles and charts are gated by `enabledModules`.
- `/api/companies` and server home data now return `enabledModules`, `enabledBlocks`, and `enabledMiniapps`.
- `/api/companies/:companyId/dashboard` now returns the same effective capability payload used by nav.
- `evaluations` and `observability` check module capability before loading heavy operational APIs.
- Route-gated page internals and miniapp-scoped components are excluded from hardcoded-global-surface findings.

Remaining report-only findings:

- `WEBAPP_BUSINESS_IMPORT`: 0.
- `RAW_AGGREGATE_QUERY`: 0.
- `UI_DERIVED_BUSINESS_COUNT`: 0.
- `POSSIBLE_FULL_BOARD_PAYLOAD`: 0.
- `HARDCODED_UNGATED_UI_SURFACE`: 0.

Known live projection consistency issue:

- Several companies have stale or incorrect sales projection counts. Examples observed:
  - Fortitude AI: raw sales cards `18`, projection sales `0`.
  - Seyu Solutions Kft: raw sales cards `21`, projection sales `0`.
  - Soccer Performance Lab Inc: raw sales cards `4`, projection sales `50`.
  - rmbd: raw sales cards `22`, projection sales `22`.

This confirms the system has both stale projections and raw fallback paths. The next delivery must reduce payload/detail loading and then remove fallback calculations from normal read paths.

Current verified state:

- `npm run audit:webapp-boundary` passes with `0` findings.
- `npm run build` passes.
- Nav miniapp attention counts now read projection fields only.
- Operations miniapp review-pressure items now read projection fields only.
- Source, goalcard, and data-file paginated APIs no longer run total-count aggregates on normal list reads.
- Opportunitycard search state reads Webapp projection instead of importing worker search-learning code.
- Flashcard, goalcard, and conversion writes no longer calculate canonical scoring in the Webapp; they preserve/sanitize operator fields and leave canonical scoring to Local AI.
- Destination mission daemon and run execution endpoints enqueue CHECK Local work instead of executing mission/daemon runtime code in the Webapp process.
- Visitor/miniapp command endpoints enqueue CHECK Local intents instead of running classify, extract, score, discover, burst, gate, plan, or promotion logic inline.
- Visitor/miniapp candidate, task, opportunity, and burst-state endpoints read stored projections/metadata instead of importing runtime planners or promotion gates.

## Delivery Order

### 1. Contract And Audit

- Add the Webapp Boundary Contract.
- Add a repeatable boundary audit script.
- Generate a machine-readable audit report in `logs/webapp-boundary-audit.json`.
- Keep the audit report-only until the reference refactor is complete.
- Status: delivered.

### 1A. Hardcoded Surface Gating

- Gate dashboard route tiles/charts/actions by canonical capabilities.
- Gate home/company chooser tiles/charts by canonical capabilities.
- Add report-only detection for ungated hardcoded UI surfaces.
- Status: delivered. Current `HARDCODED_UNGATED_UI_SURFACE` count is `0`.

### 2. Sales Board Reference Refactor

Current issues:

- Sales page fetches opportunitycards, Knowmore cards, and sales summary at page load.
- Sales board receives full opportunitycard records.
- Modal detail is bundled into the board payload.
- Counts can come from projection, raw records, or UI array fallback.

Target endpoints:

- `GET /api/companies/:companyId/sales-board`
  - Reads sales board projection only.
  - Returns lean card summaries and projection metadata.
- `GET /api/opportunitycards/:id`
  - Reads one card detail projection.
  - Used only when modal opens.
- `POST /api/intents/opportunitycards/:id/action`
  - Writes user action intent and queues Local AI.
- `POST /api/intents/sales/search`
  - Queues Local AI search.
- `POST /api/intents/sales/mine`
  - Queues Local AI mining.

Remove:

- UI fallback counts from `opportunitycards.filter(...)`.
- Full board payloads with feedback and linked flashcard detail.
- Raw fallback summary calculation from the normal read path.

Immediate implementation steps:

1. Add lean board list mode to the sales opportunitycard read API.
2. Add detail-by-ID read path for modal open.
3. Switch the sales page to request lean board summaries.
4. Switch `SalesBoard` modal open to lazy-load detail.
5. Keep actions/reorder working against the existing intent/update paths until dedicated intent endpoints are added.
6. Re-run `audit:webapp-boundary` and verify `POSSIBLE_FULL_BOARD_PAYLOAD` decreases.

Status:

- Delivered. Opportunitycard list GET now returns board summaries only.
- Delivered. Opportunitycard detail is fetched by ID when the modal opens.
- Delivered. Sales UI counts now read projection summary values only.
- Delivered. `POSSIBLE_FULL_BOARD_PAYLOAD` is now `0`.
- Delivered. `/api/companies/:companyId/sales-summary` no longer recalculates raw fallback counts or imports worker search-learning code.
- Delivered. Opportunitycard action/search learning and board rebalance runtime imports were removed from the Webapp; actions now dirty/queue Local AI refresh work.
- Current `WEBAPP_BUSINESS_IMPORT` count after this step: `0`.

### 3. Navigation And Dashboard Counts

- Make nav/home/dashboard use the same projection family.
- Remove raw count fallbacks from normal Webapp paths.
- Show stale/missing projection states instead of recomputing.
- Gate every dashboard tile, chart, action button, and secondary route card by canonical `enabledModules` / `enabledBlocks`.
- Treat ungated hardcoded cards/charts as boundary violations because they expose disabled business surfaces and waste UI/API work.

Status:

- Delivered. Company dashboard and home surfaces are module-gated.
- Delivered. Nav miniapp counts read only from projection/observability fields.
- Delivered. Operations miniapp review-pressure items read only from projection/observability fields.
- Remaining follow-up: Local AI snapshot writer should publish `webappProjection.miniapps.<miniappKey>.reviewPressureCount` so ClassScout/Compare attention counters are populated without packet scans.

### 4. Charts

- Move chart aggregation entirely into Local AI projection writers.
- Chart APIs return chart projections and freshness metadata.
- UI never aggregates raw events.

### 5. Cards

- Add canonical card summary and detail projection contracts.
- Board/list views read summaries.
- Modal/detail views fetch details lazily.
- Shared card routes read detail projection or a bounded detail read model.

### 6. Units, Blocks, Modules

- Add projections for unit/block/module state, count, status, and enabled capability summaries.
- Remove Webapp logic that resolves business status from raw capability/runtime records.
- Keep UI-only feature gating separate from business state.

### 7. Miniapps

- Miniapp UI reads miniapp projections.
- Miniapp user actions write intents.
- Research, promotion, classification, scoring, and burst execution remain Local AI-owned.

Status:

- Delivered. Visitor candidate classify/extract/prepare-review/score/discover endpoints write queued Local AI intents.
- Delivered. Miniapp burst, gate evaluation, opportunity promotion, and task planning endpoints write queued Local AI intents.
- Delivered. Candidate/task/opportunity/burst-state reads use stored projection rows and metadata.
- Remaining follow-up: Local AI must consume the queued visitor intent metadata and publish fresh miniapp projections continuously.

### 8. Enforcement

Add required tests after the first refactor lands:

- `test:webapp-boundary`
- `test:projection-contract`
- `test:board-lean-payloads`
- `test:intent-api-no-execution`
- `test:count-single-source`
- `test:modal-lazy-detail`
- `test:no-hardcoded-ui-surfaces`

## Production Safety

Rollout should be staged:

1. Audit-only.
2. Sales board projection endpoint in parallel.
3. UI switched to projection endpoint.
4. Old raw endpoint quarantined or removed.
5. Guard test enabled for sales.
6. Repeat by surface family.

Rollback:

- Keep old endpoints available only behind an admin repair flag during migration.
- Projection endpoints must expose freshness and error state.
- UI must show unavailable/stale state instead of silently recalculating.

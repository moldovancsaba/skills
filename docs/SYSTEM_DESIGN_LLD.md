# CHECKLIST System Design LLD

This document describes how the live system is structured at implementation level.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)

## 1. Runtime Architecture

Primary layers:

- web application
- database and persistence
- autonomous AI loop
- shared product UI system
- persisted pipeline queue and scheduler contract

## 2. Frontend Architecture

The frontend is intentionally rigid.

### 2.1 Approved stack

- Next.js App Router
- React
- Mantine

### 2.2 Approved design-system structure

- `providers.tsx` defines the Mantine theme
- `globals.css` defines the token layer
- `semantic-theme.ts` defines semantic surface helpers
- `ui-state.ts` defines state semantics
- `ui-interactions.ts` defines interaction helpers
- `typography.tsx` defines DS text primitives
- `unified-card.tsx` defines the card shell hierarchy
- `unified-card-modal.tsx` defines the modal shell
- `app-shell.tsx` defines page and layout primitives

### 2.3 Rigid UI rules

- Mantine only
- Mantine `Card` only as base card primitive
- feature code uses `UnifiedCard`
- feature code does not create parallel card shells
- feature code does not create local type systems
- feature code does not create local hover/motion systems

## 3. Semantic Surface Model

All product surface meaning must resolve through semantic tones:

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

All product surfaces must derive from the semantic helper layer and Mantine theme.

## 4. Enforcement Model

Architecture is protected through:

- coding standards
- documentation hierarchy
- semantic audit
- linting
- type-checking

Required commands:

```bash
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

## 5. Documentation Synchronization Rule

Implementation and documentation are part of the same system.

When the system contract changes:

1. update code
2. update the rulebook
3. update the affected contract docs
4. update the handover
5. run enforcement checks

If step 2 through 4 do not happen, the system design work is incomplete.

## 6. Pipeline Queue Architecture

The repetitive-job system now has a first-class queue model:

- `PipelineJob` persistence stores recurring/local-AI work as durable queue items
- the worker claims repetitive work from that queue before the broader company synthesis cycle
- `AI_ONLY` mode means scheduling is computed by the shared queue logic
- `HUMAN_GUIDED` mode means the persisted queue column and manual order take precedence
- the webapp `Worker Queue` board is the primary human steering surface
- score-health alerts can reprioritize queue work through the same shared contract
- the shipped UI controls are drag/drop between queue columns, manual drag/drop ordering, and `Reset to AI Only`
- there is no separate compact tweak menu in the current release; the board is the tweak surface

## 7. Evidence Durability And Conflict Handling

- source-backed Knowmore synthesis must persist durable `CitationSnapshot` records with normalized URL, excerpt, fetch timing, and content hash
- flashcards reference snapshot IDs directly, so evidence survives URL drift and re-fetch changes
- deterministic conflict detection lowers confidence and marks the flashcard for review instead of silently merging contradictory claims
- oldest-first maintenance backfills missing citation snapshots on existing flashcards

## 8. Search, Answers, And Workflow Foundations

- `internal-search.ts` is the shared retrieval boundary for internal cards, queue jobs, and workflow blueprints
- `internal-search.ts` also owns result counts, entity-layer filtering, and ranking boosts from ICE and freshness
- `grounded-answers.ts` builds bounded evidence-backed answers on top of the internal search layer, including explicit intent/confidence/evidence-group fields
- `observability.ts` aggregates heartbeat, queue, score-health, worker reports, and recent outcomes for mission-control surfaces, and drives bounded repair recommendations
- `app/api/knowmore/health/route.ts` exposes knowledge-layer health states and bounded repair actions directly on the Knowmore surface while still using the shared queue contract underneath
- `evaluation-bench.ts` is an internal admin-only replay and promotion-gate module used for AI quality governance, not a normal end-user checklist page
- `budget-governor.ts` owns workload usage attribution, virtual/default budget policies, budget-pressure summaries, recommended budget events, and explicit control application for queue, workflow, search/answer, and observability work
- `workflow-blueprints.ts` owns the persisted bounded workflow-builder contract and default blueprint registry; active blueprints are synchronized into `PipelineJob` records and executed by the shared queue worker
- `enrichment-waterfall.ts` owns the persisted provider-ordering and fallback policy contract for enrichment governance, and `url-enrichment.ts` consumes that policy at runtime for product/competitor research

## 9. Blended Priority Architecture

- `scoring-contract.js` owns `computeBlendedPriorityProfile`
- the profile returns a bounded priority score, component signals, weights, lifecycle and memory multipliers, and short reason labels
- each scored card may also persist a `scoreProfile` JSON object that keeps agent proposal, calibrated heuristic score, and final blended score together
- score profiles preserve decimal internal precision for tuple health and rescoring compatibility even where legacy fields or UI surfaces round for display
- generator/refiner scoring may also inject company-history calibration from accepted, declined, modified, and delivered cards before the final score is persisted
- task scoring converts a delivery-difficulty model into the persisted `ease` signal so the system does not confuse long text with hard execution
- frontier recomputation uses blended priority plus relative peer ranking for tactical column assignment while preserving raw ICE as the visible card score
- tactical API responses include `priorityProfile` so the board can explain why an item is ranked where it is
- manual planning anchors from drag/drop remain first-class human signal and are preserved ahead of AI-only priority ordering
- `score-health.js` plus `scripts/repair-ice-scores.js` form the maintenance side of the scoring architecture: one measures clustering and one resynchronizes historical cards onto the live shared contract
- `feedback/route.ts` writes task feedback into the canonical `Feedback` stream so worker-side `DELIVER` propagation and lifecycle handling are not bypassed by the webapp
- flashcards and tasks both persist lineage-family and duplicate-cluster context so refinement, suppression, and downstream reward remain traceable across layers
- `refiner.js` now owns duplicate-cluster tagging and split-aware task refinement in addition to merge/suppress/enrich paths

## 10. Budget Governor Architecture

- `AiWorkloadUsage` stores company/feature attribution for queue jobs, workflow execution, search/answer work, observability actions, and future model/provider calls
- `BudgetPolicy` stores per-company feature controls and thresholds for estimated daily cost, workload units, retries, external requests, and control mode
- `BudgetEvent` stores reviewable budget pressure, anomaly, and control-application events with evidence and value assessment
- budget values are estimated by default and must remain visibly distinct from actual provider spend
- queue worker completion/failure, workflow execution, search/answer operations, and observability actions all record workload usage in the first slice
- Observability renders budget pressure, workload attribution, recommended budget events, and bounded controls for throttling queue work and cache/reuse policy
- budget controls must not silently erase human-guided queue ordering or suppress critical evidence/safety work

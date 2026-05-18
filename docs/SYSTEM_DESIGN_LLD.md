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
- background snapshot worker
- product read-model projection layer
- local self-learning export and Apple-Silicon training workspace
- shared product UI system
- persisted pipeline queue and scheduler contract

### 1.1 Runtime entrypoints

The shipped local runtime is started through:

- `npm run guardian`
  - supervises the local AI process group

- `npm run dev`
  - serves the Next.js application

The guardian-managed process group includes:

- `sync`
- `snapshot-worker`
- `status-server`

### 1.2 Runtime ports and operator surfaces

Default local web application:

- `http://localhost:3000`

If the default port is occupied, the app may be started on another free port such as:

- `http://localhost:3415`

Local operator surface:

- `/local-ai`
  - global local-AI mission-control page
  - not company-scoped
  - not login-gated on localhost-style hosts
  - not available on the online webapp domains

Raw local runtime endpoints:

- worker health: `http://127.0.0.1:10005/health`
- status payload: `http://127.0.0.1:10006/api/status`
- snapshot-worker health: `http://127.0.0.1:10007/health`

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
- `typography.tsx` defines DS text primitives and the approved `Text` / `Title` wrappers
- `unified-card.tsx` defines the card shell hierarchy
- `unified-card-modal.tsx` defines the modal shell
- `app-shell.tsx` defines page and layout primitives

### 2.3 Rigid UI rules

- Mantine only
- Mantine `Card` only as base card primitive
- feature code uses `UnifiedCard`
- feature code uses DS-owned `Text` / `Title` wrappers instead of raw Mantine typography imports
- feature code does not use raw DOM wrappers or feature-level `className` hooks as a parallel composition path
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
- the worker executes repetitive work only through that queue; there is no parallel direct company synthesis loop anymore
- `AI_ONLY` mode means scheduling is computed by the shared queue logic
- `HUMAN_GUIDED` mode means the persisted queue column and manual order take precedence
- the webapp `AI Queue` board is the primary human steering surface
- score-health alerts can cause the local AI system to reprioritize queue work through the same shared contract after it reads persisted alert state or operator intents
- the shipped UI controls are drag/drop between queue columns, manual drag/drop ordering, and `Reset to AI Only`
- there is no separate compact tweak menu in the current release; the board is the tweak surface
- queue board reads must return persisted `PipelineJob` state only; webapp reads must not trigger queue synchronization
- workflow edits and operator repair actions are bridged into persisted `SystemCommand` records for the local AI worker to consume

The shipped planner and quality-engine queue families are:

- `FEEDBACK_RECONCILIATION`
- `CARD_RESCORING`
- `FRONTIER_RECOMPUTE`
- `ENSURE_FLASHCARD_MINIMUM`
- `RESEARCH_BACKFILL`
- `ENSURE_IDEABANK_MINIMUM`
- `ENSURE_ROADMAP_MINIMUM`
- `ENSURE_BACKLOG_MINIMUM`
- `ENSURE_TODO_MINIMUM`
- `ENSURE_CHECKLIST_MINIMUM`
- `MINE_FLASHCARD_OPPORTUNITIES`
- `MINE_TASK_OPPORTUNITIES`
- `FEEDBACK_PRESSURE_REGENERATION`
- `REFRESH_FLASHCARDS`
- `REFRESH_TASKS`
- `REFRESH_DATACARDS`
- `REFRESH_GOALS`
- `SCORE_ALERT_REPAIR`
- `WORKFLOW_BLUEPRINT`

Legacy compatibility jobs may still exist in persisted state:

- `FULL_MAINTENANCE`
- `COMPANY_SYNTHESIS`

They are compatibility paths, not the primary operating contract.

## 6.1 Execution ownership

- `sync` is the only foreground worker allowed to mutate planner-owned business state
- `sync` claim miss must not perform inline queue-topology synchronization; it may only force-wake the background lane and then return to rest
- `snapshot-worker` must not claim planner queue jobs
- `snapshot-worker` owns background queue-sync cadence and bounded queue-topology refresh in addition to snapshot refresh
- `status-server` is read-only for business state and operator truth assembly
- `guardian` supervises processes and recovery, but does not own planner mutation logic

## 7. Evidence Durability And Conflict Handling

- source-backed Knowmore synthesis must persist durable `CitationSnapshot` records with normalized URL, excerpt, fetch timing, and content hash
- flashcards reference snapshot IDs directly, so evidence survives URL drift and re-fetch changes
- deterministic conflict detection lowers confidence and marks the flashcard for review instead of silently merging contradictory claims
- oldest-first maintenance backfills missing citation snapshots on existing flashcards

## 8. Search, Answers, And Workflow Foundations

- internal retrieval, result counts, entity-layer filtering, ranking boosts from ICE and freshness, and grounded-answer synthesis belong to the local AI system, not the webapp runtime
- any webapp search surface must read persisted retrieval/answer results and write query/filter interaction records only
- observability data shown in the webapp must be precomputed by the local AI system and persisted into MongoDB Atlas or local runtime artifacts first; the online app only reads those persisted results and writes operator interaction records
- `observability.ts` is a webapp read-model adapter for mission-control surfaces, not an authoritative computation owner; repair recommendations, score-health evaluation, and worker-state interpretation belong to the local AI system
- `app/api/knowmore/health/route.ts` must expose persisted knowledge-layer health state and write bounded repair intents or feedback signals only; it must not become a parallel health-calculation engine
- `evaluation-bench.ts` is an internal admin-only replay and promotion-gate module used for AI quality governance, not a normal end-user checklist page
- `budget-governor.ts` owns workload usage attribution, virtual/default budget policies, budget-pressure summaries, recommended budget events, and explicit control application for queue, workflow, search/answer, and observability work
- `workflow-blueprints.ts` owns the persisted bounded workflow-builder contract and default blueprint registry; active blueprints are synchronized into `PipelineJob` records by the local AI system and executed by the shared queue worker
- `enrichment-waterfall.ts` owns the persisted provider-ordering and fallback policy contract for enrichment governance, and `url-enrichment.ts` consumes that policy at runtime for product/competitor research
- ingress routes for topics, sources, files, and bridge data write raw rows only; webapp request handlers must not derive authoritative scores during ingress
- feedback analytics and hashtag recommendations are persisted into `IntelligenceSnapshot` by the local AI system and read from there by the webapp

## 8.1 Product read-model architecture

- the online webapp must stay projection-first on hot product routes
- `IntelligenceSnapshot.webappProjection` is the canonical per-company product read model for company summary surfaces
- the local AI side owns projection creation and refresh
- the webapp owns projection normalization, rendering, and bounded fallback only
- product pages must not recompute many live counts on load when a prepared projection exists
- runtime/operator truth such as worker stage, memory governor state, and queue hardening remains outside this product projection and belongs to `/local-ai` plus runtime endpoints

Current first-slice projection consumers:

- `GET /api/companies`
- `GET /api/companies/[companyId]/dashboard`
- `GET /api/companies/[companyId]/nav`
- `GET /api/companies/[companyId]/planning-summary`
- server-side company dashboard bootstrapping

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
- score-health measurement and repair are local-AI responsibilities; the worker computes and persists score-health outputs, and bounded repair tooling resynchronizes historical cards onto the live shared contract
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

## 11. Local Self-Learning Architecture

- `scripts/export-learning-datasets.mjs` is the canonical dataset-export entrypoint for self-learning
- `scripts/prepare-mlx-learning-run.mjs` is the canonical Apple-Silicon run-bundle generator for MLX / MLX-LM training
- `scripts/evaluate-learning-candidate.mjs` is the first local baseline-vs-candidate gate over exported evaluation cases
- `src/lib/local-learning.ts` is the server-side reader for local `training/runs/` manifests and candidate evaluation reports
- `app/api/evaluations/route.ts` also publishes completed local-learning run outcomes into the normal `OutcomeEvent` and workload ledgers
- exported dataset families are supervised fine-tuning, preference pairs, and evaluation cases
- the active training path is Apple-Silicon-native:
  - dataset export from checklist persistence
  - MLX / MLX-LM fine-tuning
  - local evaluation
  - Ollama canary and promotion
- `training/` is the repository workspace for self-learning configuration and rollout scaffolding
- parked research trainers such as Unsloth, LLaMA-Factory, and Axolotl may remain documented as future options, but they are not active delivery dependencies in the current architecture

## 12. Planner And Quality Architecture

- `docs/LOCAL_AI_PLANNER_LLD.md` is the authoritative low-level design for bootstrap, lane refill, weakest-upstream ceilings, timeout handling, and oldest-first maintenance
- `docs/LOCAL_AI_QUALITY_ENGINE_LLD.md` is the authoritative low-level design for opportunity mining, editorial quality, novelty suppression, feedback pressure, and research-backed regeneration
- build/release identity must be observable from the live worker so operators can see whether runtime matches repository history
- `docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md` is the authoritative target design for 24/7 worker hardening, strict foreground linearity, background isolation, low-memory degradation, and stale-work recovery
- `docs/LOCAL_AI_RUNTIME_SOP.md` is the authoritative shipped sequence and rulebook for the foreground loop, background loop, queue sync, card creation, and failure recovery
- the first shipped runtime-hardening slice now includes a dedicated `snapshot-worker` process and foreground/background separation for planner queue execution versus intelligence snapshot refresh
- the current shipped runtime contract also includes scheduled verification and synthetic chaos drills so operator health is backed by persisted runtime checks instead of raw log reading alone

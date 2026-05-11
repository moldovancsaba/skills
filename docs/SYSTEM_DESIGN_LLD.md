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
- `budget-governor.ts` owns workload usage attribution, virtual/default budget policies, budget-pressure summaries, recommended budget events, and explicit control application for queue/evaluation/content/observability work
- `workflow-blueprints.ts` owns the persisted bounded workflow-builder contract and default blueprint registry; active blueprints are synchronized into `PipelineJob` records and executed by the shared queue worker
- `enrichment-waterfall.ts` owns the persisted provider-ordering and fallback policy contract for enrichment governance, and `url-enrichment.ts` consumes that policy at runtime for product/competitor research

## 9. Blended Priority Architecture

- `scoring-contract.js` owns `computeBlendedPriorityProfile`
- the profile returns a bounded priority score, component signals, weights, lifecycle and memory multipliers, and short reason labels
- frontier recomputation uses the blended priority score for rank and tactical column thresholds while preserving raw ICE as the visible card score
- tactical API responses include `priorityProfile` so the board can explain why an item is ranked where it is
- manual planning anchors from drag/drop remain first-class human signal and are preserved ahead of AI-only priority ordering

## 10. Evaluation Bench Architecture

- `evaluation-bench.ts` owns the seeded synthetic fixtures, case definitions, rubric weights, replay scorer, baseline-vs-candidate comparison, and promotion-gate metadata
- `/api/evaluations` runs the bench behind normal company membership checks and is non-mutating by default
- `/:companyId/evaluations` is the operator surface for running advisory replay, reviewing case-level reasons, and comparing candidate behavior to the current baseline
- failed gates can be explicitly published to Observability as `EVAL_GATE_FAILED` outcome events so eval failures and production regressions share terminology
- evaluation cases use synthetic fixture markers and tenant-isolation scoring so the bench does not reward cross-tenant or live-data leakage

## 11. Content Generation Architecture

- `content-generation.ts` owns the deterministic first-slice content-generation contract for tone profiles, positioning extraction, platform limits, and channel-specific output formatting
- `/api/content-generation` runs behind normal company membership checks, reads existing company/product/competitor/goal/topic/task context, and persists generated outputs as `CreativeDraft` records
- `/:companyId/content-generation` is the operator surface for choosing tone, adding an optional campaign brief, generating content, copying outputs, and reviewing recent drafts
- generated bundles include exactly five email subject lines, Facebook/Google/LinkedIn ad copy, Twitter/LinkedIn/Facebook social posts, and landing-page hero/benefit/CTA copy
- the current release is draft-only: it does not post externally, generate images, or claim multi-language output

## 12. Athlete App Architecture

- `AthleteActivityLog` is the persisted daily athlete record, keyed by company, athlete email, activity date, and optional assigned checklist item
- `athlete-activity.ts` owns activity-type normalization, bounded score/duration/metrics handling, day-window calculation, and daily/team summary math
- `/api/athlete` runs behind normal company membership checks for self records and supports an admin-scoped `scope=team` view for coach review
- `/:companyId/athlete` is the athlete-facing surface for coach-assigned work, activity recording, wellness/body metrics, readiness notes, pain/nutrition notes, and completion evidence
- `/:companyId/athletes` is the coach-facing records surface for team daily submissions, load, completion evidence, readiness, sleep, soreness, and pain flags
- completing assigned work from the athlete app records an audit/outcome event and moves the linked checklist item to completed/archived state

## 13. Budget Governor Architecture

- `AiWorkloadUsage` stores company/feature attribution for queue jobs, evaluation replays, content-generation runs, observability actions, and future model/provider calls
- `BudgetPolicy` stores per-company feature controls and thresholds for estimated daily cost, workload units, retries, external requests, and control mode
- `BudgetEvent` stores reviewable budget pressure, anomaly, and control-application events with evidence and value assessment
- budget values are estimated by default and must remain visibly distinct from actual provider spend
- queue worker completion/failure, evaluation POSTs, content-generation POSTs, and observability actions all record workload usage in the first slice
- Observability renders budget pressure, workload attribution, recommended budget events, and bounded controls for throttling queue work, batching evaluations, and cache/reuse policy
- budget controls must not silently erase human-guided queue ordering or suppress critical evidence/safety work

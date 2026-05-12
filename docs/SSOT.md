# CHECKLIST Product SSOT

This is the product and system single source of truth.

It is subordinate only to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md).

## 1. Product Purpose

CHECKLIST is a continuously operating, multi-tenant intelligence system that transforms raw business evidence into structured knowledge, goals, and tactical work.

It is a general company decision-maker, task manager, and AI support system.

It is not the product SSOT for:

- athlete-facing apps
- coach-facing athlete operations
- standalone content-generation studios
- campaign execution suites
- SEO, outreach, or CRM verticals as first-class app surfaces

Internal governance exception:

- `Evaluation Bench` may exist as an admin-only internal quality-governance route for synthetic replay, regression checks, and promotion gates
- it is not a normal end-user checklist surface and should not return to the main module navigation

## 2. Core Model

The product is card-based.

Primary user-facing layers:

- Data
- Topics
- Knowmore
- Goals
- Checklist
- Tactical
- Review
- Worker Queue
- Search & Answers
- Observability
- Workflows

Anything outside those layers belongs to `IDEABANK`, a dedicated external product board, or a future explicitly approved promotion into checklist-core.

## 3. System Stack

Backend and orchestration:

- Next.js
- Prisma
- MongoDB Atlas
- Ollama

Frontend:

- Mantine only
- centralized Mantine theme
- centralized semantic token layer
- centralized card system through `UnifiedCard`

## 4. Product UI SSOT

The product UI contract is:

- Mantine only
- semantic tones only
- Mantine `Card` as base primitive
- `UnifiedCard` as feature-level card API
- `UnifiedCardModal` as modal content shell
- centralized typography
- centralized interactions

This contract is implemented in:

- `src/components/providers.tsx`
- `src/app/globals.css`
- `src/lib/semantic-theme.ts`
- `src/lib/ui-state.ts`
- `src/lib/ui-interactions.ts`
- `src/components/ui/typography.tsx`
- `src/components/ui/unified-card.tsx`
- `src/components/ui/unified-card-modal.tsx`
- `src/components/ui/app-shell.tsx`

## 5. Processing Model

The autonomous cycle remains:

1. load companies
2. select fairly
3. pull new evidence and feedback
4. teach memory
5. process through the AI pipeline
6. update statuses and expirations
7. push results back

The repetitive-job contract now also includes:

- persisted `PipelineJob` queue records
- explicit `AI_ONLY` vs `HUMAN_GUIDED` scheduling modes
- a webapp `Worker Queue` board as the primary HiTL steering surface for repetitive jobs
- one-step reset back to AI-only scheduling
- drag/drop queue column changes and drag/drop manual ordering as the shipped human-tweak controls
- no separate compact tweak menu today; the board itself is the canonical tweak surface

Backlog contract:

- active implementation work may come from delivery-oriented project columns
- `IDEABANK` is explicitly non-executable by default
- ideabank and vertical-experiment items must be promoted out of ideabank before they can become normal checklist implementation work

The current intelligence-operations contract also includes:

- one unified internal search layer across cards, queue work, and workflow blueprints
- search responses now include entity-type filters, per-layer counts, and ranking that blends text overlap with ICE/freshness cues
- first-class entity search results deep-link into the canonical shared `/card/[uuid]` detail route for Data, Topics, Knowmore, Goals, and Tasks
- one blended tactical priority profile that keeps ICE visible while ranking work through explainable ICE, quality, urgency, freshness, human-signal, risk, lifecycle-state, and memory inputs
- one persisted score provenance profile per scored card, preserving agent proposal, calibrated heuristic score, and final blended score
- one grounded answer layer over company context using explicit evidence objects
- grounded answers now expose intent, confidence, evidence-group framing, and the applied entity-layer scope as first-class contract fields
- grounded answers must visibly surface cited evidence cards in the operator UI, not just aggregate evidence counts
- grounded answers must also render the named allowed scope layers in the operator UI so the synthesis boundary is explicit and reviewable
- Search & Answers must require at least one explicit allowed layer and must not silently widen back to all layers when the operator scope selection is empty
- Search & Answers must clear stale result and answer state when the allowed layer selection changes so the visible output always reflects the current scope
- one observability surface for worker health, queue pressure, score-health, AI workload budget pressure, and recent outcomes
- observability also owns bounded repair and budget actions for queue sync, score-repair escalation, failed-job recovery, queue throttling, evaluation batching, and cache/reuse controls
- persisted workflow blueprints for bounded automation building, materialized as real worker-queue jobs when active
- persisted enrichment waterfall policies for provider ordering and fallback governance, applied at runtime during URL intelligence enrichment
- one AI workload budget-governor layer that persists `AiWorkloadUsage`, `BudgetPolicy`, and `BudgetEvent` records for company/feature attribution, estimated cost, workload units, retry pressure, reviewable budget events, and explicit operator-applied controls

Tactical placement contract:

- `iceScore` remains the visible score on task cards
- `priorityProfile` is the ranking explanation used for tactical ordering and frontier placement
- human drag/drop anchors remain explicit human guidance and are not silently erased by AI scoring
- priority is assigned by blended relative rank inside the active peer pool, not raw ICE alone

## 6. AI Brain Rule

In CHECKLIST, the “AI brain” is not just model prompts.
It also includes the repository rule and handover documents that future agents use as operating memory.

Whenever the live contract changes, the AI brain must be updated in the same work.

Minimum required updates:

- `docs/RULEBOOK.md`
- `HANDOVER.md`

Plus every directly affected deeper contract doc.

## 7. Completion Rule

A change is incomplete if:

- code changed
- but the contract docs still describe the old system

That is treated as a system integrity failure, not a documentation nice-to-have.

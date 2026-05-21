# CHECKLIST Product SSOT

This is the product and system single source of truth.

It is subordinate only to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md).

Future-function delivery rules are further defined in [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md).

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
- AI Queue
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
- centralized DS-owned typography, including the approved `Text` and `Title` wrappers in `src/components/ui/typography.tsx`
- centralized entity-detail rendering contract: `UnifiedCardModal` owns the shell, while each first-class card family must render its full persisted typed detail set inside the shared card grammar

## 4. Product UI SSOT

The product UI contract is:

- Mantine only
- semantic tones only
- Mantine `Card` as base primitive
- `UnifiedCard` as feature-level card API
- `UnifiedCardModal` as modal content shell
- centralized typography
- centralized interactions
- centralized layout grammar

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

Shared shell rule:

- app-shell route cards, metric cards, and empty states are product card surfaces and must render through `UnifiedCard`, not a parallel raw-card branch
- shared visual chrome such as sidebar shells, accent rails, dropzones, modal shells, dividers, and bullets must come from `src/lib/semantic-theme.ts`, not feature-local inline recipes
- shared navigation and dashboard route surfaces must use one approved route-card grammar and one approved sidebar grammar
- decorative route-card footer labels are not part of the live product grammar
- route-card height, density, and hierarchy must come from shared shell primitives rather than page-local composition

## 5. Processing Model

The current shipped processing model is queue-owned and process-split.

Runtime processes:

1. `guardian`
   - restart supervision
   - heartbeat and health polling
   - stale-work safety net

2. `sync`
   - the only foreground mutating worker
   - claims and executes queue jobs one at a time

3. `snapshot-worker`
   - background read-model refresher
   - refreshes intelligence snapshots outside the foreground execution lane

4. `status-server`
   - read-only observability and operator surface

Local startup contract:

- start the web app with `npm run dev`
- start the local AI runtime with `npm run guardian`
- if the default web port `3000` is occupied, run the app on another free port such as `3415`

Operator surface contract:

- `/local-ai` is the local-only global mission-control route for the local AI runtime
- it is not company-scoped
- it is not login-gated
- worker and background health are also exposed through the raw local endpoints on ports `10005`, `10006`, and `10007`

Foreground execution contract:

1. recover stale or wedged work if needed
2. claim one runnable queue job
3. if no runnable job exists:
   - wake `snapshot-worker` for background queue-topology refresh
   - rest briefly
4. if a job is claimed:
   - execute one queue job
   - complete or fail that job
5. rest briefly

The older broad per-company “load companies and run a full synthesis cycle” description is no longer the runtime contract.

## 5.1 Product read-model contract

The online webapp is projection-first on hot product routes.

Why:

- the local AI machine is memory-fragile under sustained runtime load
- the online webapp read path had become too expensive for what should feel instant

Therefore:

- the local AI side prepares company read models ahead of time
- the online app reads those prepared projections first
- the online app must not behave like a second analytics engine

Authoritative per-company product projection:

- `IntelligenceSnapshot.webappProjection`

Hot product reads that should prefer that projection:

- company list
- company dashboard
- company nav/sidebar counts
- tactical/checklist planning summaries

Dashboard route contract:

- the home/main dashboard should bootstrap from server-loaded prepared company data on the first response
- the company dashboard should bootstrap from server-loaded prepared data on the first response
- the authenticated shell should bootstrap basic user identity from the signed server session where possible
- home summary charts should not all hydrate eagerly on first paint; defer heavy chart rendering until the cards approach the viewport
- non-critical panels such as membership or identity details should not block the first product-summary render
- home-card chart data should come from the prepared projection too, not from broad snapshot analytics reads on the hot path

Allowed bounded fallback:

- lightweight snapshot-field fallback if the projection is missing

Forbidden hot-path behavior:

- many per-company live count queries
- repeated broad top-task recomputation on each request
- page-load-triggered worker synchronization

The repetitive-job contract now also includes:

- persisted `PipelineJob` queue records
- explicit `AI_ONLY` vs `HUMAN_GUIDED` scheduling modes
- a webapp `AI Queue` board as the primary HiTL steering surface for repetitive jobs
- one-step reset back to AI-only scheduling
- drag/drop queue column changes and drag/drop manual ordering as the shipped human-tweak controls
- no separate compact tweak menu today; the board itself is the canonical tweak surface
- deterministic planner-owned bootstrap and maintenance jobs for inventory, lane refill, quality ceilings, timeout recovery, and oldest-first refresh
- quality-engine jobs for opportunity mining, editorial gating, research-backed regeneration, novelty suppression, and feedback-pressure repair
- the 24/7 runtime hardening plan for strict foreground linearity, background isolation, low-memory degradation, and stale-work recovery is defined in `docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md`
- the shipped step-by-step runtime sequence and rules are defined in `docs/LOCAL_AI_RUNTIME_SOP.md`
- scheduled runtime verification runs from `snapshot-worker`, persists its latest report into global settings, and surfaces the result on `/local-ai`
- intelligence snapshot refresh is no longer part of the foreground queue lane; it runs in the dedicated `snapshot-worker`
- queue-topology refresh on claim miss is also delegated out of the foreground lane; `snapshot-worker` owns the background queue-sync cadence and may be force-woken by foreground
- touched-company projection refresh now follows the same background ownership pattern: successful company work marks the company projection-dirty, and `snapshot-worker` drains those targeted repairs before the slower broad snapshot sweep
- `snapshot-worker` also performs bounded cold-start projection backfill so missing or outdated product projections are repaired even before a company is touched again
- the home/main dashboard is now part of the same server-bootstrap contract: it should not wait for post-mount company/session/industry fetch waterfalls when prepared product data is available
- persistent slowness on authenticated product routes should be investigated through real live-route profiling (`Server-Timing` plus `npm run profile:webapp`) rather than further blind trimming

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
- opportunitycards use the same canonical task-like scoring family as taskcards, with `weight` acting as the persisted effort alias; create/update/modify/refresh/repair paths must normalize and persist `scoreProfile`, not raw ad hoc ICE fields
- historical opportunitycard score repair is worker-owned: the bounded repair module is reused by the CLI repair script and by the worker integrity loop inside the DB-backed local-AI runtime so existing rows self-heal in authoritative bounded slices with persisted cursor/state tracking
- internet opportunity discovery is also worker-owned: online search, candidate filtering, draft-card creation, enrichment, dedupe, and refresh must run in the local AI worker rather than in the hosted webapp
- opportunity search memory is a persisted per-company contract: the worker must retain query/domain/term learning, preserve search provenance on mined leads, and update that memory from authoritative operator `ACCEPT` / `DECLINE` outcomes so future search queries improve over time
- internet-discovered opportunitycards must begin life as drafts, not final checked leads; the worker is expected to continue working the draft through refresh and enrichment after creation
- one direct Knowmore correction surface for pin/hide/wrong/refresh/source-suppression controls, persisted as durable correction events
- one grounded answer layer over company context using explicit evidence objects
- grounded answers now expose intent, confidence, evidence-group framing, and the applied entity-layer scope as first-class contract fields
- grounded answers must visibly surface cited evidence cards in the operator UI, not just aggregate evidence counts
- grounded answers must also render the named allowed scope layers in the operator UI so the synthesis boundary is explicit and reviewable
- Search & Answers must require at least one explicit allowed layer and must not silently widen back to all layers when the operator scope selection is empty
- Search & Answers must clear stale result and answer state when the allowed layer selection changes so the visible output always reflects the current scope
- one observability surface for worker health, queue pressure, score-health, AI workload budget pressure, and recent outcomes
- observability captures bounded repair intents and budget-control records for queue sync, score-repair escalation, failed-job recovery, queue throttling, evaluation batching, and cache/reuse controls; the local AI system executes those actions after pulling them from MongoDB Atlas
- Knowmore owns its own operator-visible health and bounded repair surface on top of the shared queue and score-health model
- persisted workflow blueprints for bounded automation building, materialized as real worker-queue jobs when active
- persisted enrichment waterfall policies for provider ordering and fallback governance, applied at runtime during URL intelligence enrichment
- one AI workload budget-governor layer that persists `AiWorkloadUsage`, `BudgetPolicy`, and `BudgetEvent` records for company/feature attribution, estimated cost, workload units, retry pressure, reviewable budget events, and explicit operator-applied controls
- one Apple-Silicon-native self-learning path that exports supervised, preference, and evaluation datasets from feedback and correction history, trains candidates through MLX / MLX-LM, and promotes them back into Ollama only after evaluation gates
- one local AI quality engine that periodically revisits datacards for new flashcard opportunities and revisits flashcards for new task opportunities, even when minimum inventory targets are already satisfied
- recurring user feedback must influence not only immediate card outcomes but also future refresh, research, suppression, and regeneration priority through persisted pressure signals

Tactical placement contract:

- `iceScore` remains the visible score on task cards
- `priorityProfile` is the ranking explanation used for tactical ordering and frontier placement
- human drag/drop anchors remain explicit human guidance and are not silently erased by AI scoring
- priority is assigned by blended relative rank inside the active peer pool, not raw ICE alone
- score calibration is history-aware: accepted, declined, modified, and delivered company outcomes are valid first-class inputs for new-card impact/confidence scoring
- task ease is calibrated from delivery difficulty and then persisted as an ease signal; dependencies, coordination burden, expertise, time-to-value, and delivery history are part of that contract
- internal score precision remains decimal-first inside `scoreProfile` and score-health tuple auditing, even where compatibility fields or UI badges still round for display
- bounded historical repair/backfill is part of the contract, so flashcards and taskcards can be resynchronized onto the live scoring model without one-off migration logic
- the scoring-accuracy track is closed as architecture work: residual warnings now flow through score-health monitoring and repair, not through local alternative scoring implementations
- task `DELIVER` is a separate executed-in-reality signal, not a synonym for `ACCEPT`
- flashcards and tasks both carry lineage fields (`versionFamilyId`, `duplicateClusterId`, `generatedFromIds`, `refinedFromId`) so refinement, suppression, and downstream reward can remain explainable
- parked research tools such as Unsloth, LLaMA-Factory, and Axolotl are not active rollout dependencies in the current product contract

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

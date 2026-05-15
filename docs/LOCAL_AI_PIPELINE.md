# checklist Local AI Pipeline

This document describes the current shipped behavior of the checklist online/local AI pipeline.

The active self-learning rollout for this pipeline is Apple-Silicon-native:

- export learning datasets from persisted checklist feedback and corrections
- fine-tune candidate local models through MLX / MLX-LM
- evaluate candidates locally
- deploy approved candidates back into Ollama

Parked research tools such as Unsloth, LLaMA-Factory, and Axolotl are not part of the active delivery path today.

## System split

checklist has two cooperating parts:

1. `online webapp`
   - user-facing
   - runs on Vercel
   - captures raw data, topics, hashtags, and feedback
   - reads persisted results from MongoDB Atlas
   - writes user interaction records back to MongoDB Atlas
   - must not become an authoritative calculation layer for score health, observability interpretation, analytics history, or queue recommendations

2. `local AI layer`
   - runs continuously on the local machine
   - supervises a queue-owned worker loop
   - fetches / enriches source evidence
   - researches around active topics
   - generates and revisits flashcards, goalcards, and taskcards
   - maintains scoring, freshness, and tactical placement
   - calculates operational health, score health, analytics snapshots, and repair recommendations
   - pushes those results back into MongoDB Atlas or runtime artifacts consumed by the app

The database is the shared persistence layer between them.

Authoritative boundary:

- everything that materially calculates intelligence state belongs to the local AI layer
- the online app shows persisted results from the database
- the online app records user interactions to the database
- the local AI layer pulls those records, calculates, and pushes updated state back

## Runtime processes

The local runtime now has 4 always-on processes:

1. `guardian`
   - watchdog only
   - owns restart logic, health polling, heartbeat writing, and command bridge polling

2. `sync`
   - the only state-mutating worker
   - claims queue jobs and executes them

3. `status-server`
   - observability and control surface
   - does not own business-state mutation

4. `snapshot-worker`
   - background read-model refresher
   - owns bounded intelligence snapshot refresh only
   - must not claim planner queue jobs

## Canonical flow

### 1. Raw data ingestion

Users add data on:
- `/:companyId/data`

The webapp stores raw rows in:
- `Source`
- `UploadedSourceFile`
- `Topic`
- `HashtagFeedback`

Important:
- raw source records are treated as `DATA`
- topics are a separate operator-prioritized focus layer
- processed knowledge belongs in `FLASHCARDS`
- actionable recommendations belong in `TASKS`

### 2. Local enrichment

The local layer can enrich a source using:
- direct URL fetch
- page text extraction
- public signal collection
- local model reasoning
- topic priority context
- hashtag context and feedback

The shipped scheduler is now queue-only.

That means:

1. `guardian` no longer runs taxonomy audits, kanban recomputes, or sidecar intelligence mutations
2. `sync` no longer runs a direct per-company synthesis loop beside the queue
3. all local-AI mutations are executed only through claimable pipeline jobs

Current worker loop:

1. startup integrity scrub
2. sync queue state only when the bounded foreground sync interval says it is due
3. claim the next bounded pipeline batch
4. execute only those jobs
5. rest briefly
6. repeat

The worker rests for a short active interval after productive queue work and a longer idle interval when no queue work is available.

Runtime hardening note:

- this foreground loop is still the current shipped contract
- the claim path no longer performs duplicated full-company queue sync before every single claim
- snapshot refresh has now been removed from this foreground lane and moved into a dedicated `snapshot-worker`
- memory-band gating now pauses the foreground worker under `CRITICAL` memory pressure and pauses the background worker unless memory is `HEALTHY`
- the broader hardening design is defined in [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)

## Deterministic planner and quality engine

The planner and quality engine are now part of the shipped runtime contract.

Authoritative designs:

- [docs/LOCAL_AI_PLANNER_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PLANNER_LLD.md)
- [docs/LOCAL_AI_QUALITY_ENGINE_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_QUALITY_ENGINE_LLD.md)
- [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)

Shipped planner behavior includes:

- explicit company operating modes: `INACTIVE`, `BOOTSTRAP`, `MAINTENANCE`
- deterministic lane minimums for `CHECKLIST`, `TODO`, `BACKLOG`, `ROADMAP`, and `IDEABANK`
- weakest-upstream status ceilings for flashcards and taskcards
- explicit bootstrap fallback from task generation to flashcard generation to datacard research backfill
- oldest-first maintenance cadence by card layer
- timeout-based bounded execution for generation work

Shipped quality-engine behavior includes:

- datacard-to-flashcard opportunity mining
- flashcard-to-task opportunity mining
- research-backed create and refresh policy
- novelty suppression before publish
- editorial quality gate for create and refresh flows
- feedback-pressure regeneration priority

## Queue-owned scheduler contract

The queue is the single execution authority for local-AI work.

Current managed job families:

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

Legacy compatibility jobs may still appear:

- `FULL_MAINTENANCE`
- `COMPANY_SYNTHESIS`

This replaces the older “serial per-company cycle” model as the authoritative runtime contract.

## Purpose-specific audit clocks

The worker now treats audit timing as multiple independent concerns rather than one overloaded field.

Purpose-specific clocks:

- `lastRescoredAt`
  - used for periodic rescoring cadence and stale-audit queue signals

- `lastTaxonomyAuditedAt`
  - reserved for taxonomy/layer audit work
  - must not be reused for rescoring or correction resolution

- `lastCorrectionReconciledAt`
  - used for flashcard correction reconciliation and Knowmore correction backlog health

Legacy field:

- `lastAuditedAt`
  - deprecated
  - retained only for backward compatibility during migration

Two runtime rules now matter for delivery:

- generation is `done is better than perfect`: low-score but valid cards are allowed through so later cycles can improve them
- malformed or empty JSON from the primary model no longer silently kills delivery; recommendation/task work is queued for a secondary local model retry
- source-backed knowledge must stay explainable even when raw URLs drift; durable citation snapshots are part of the worker contract

Current enrichment outputs may include:
- conclusions
- judgments
- recommendations
- comparisons
- risks and opportunities
- forecasts
- news-like signals

### 3. Flashcard generation

Knowmore flashcards are generated from enriched evidence and stored in:
- `Flashcard`
- `FlashcardSource`
- `FlashcardAction`

Current flashcard kinds:
- `SUMMARY`
- `EXPLANATION`
- `COMPARISON`
- `NEWS`
- `CONCLUSION`
- `EVALUATION`
- `OPINION`
- `JUDGMENT`
- `RECOMMENDATION`
- `RESEARCH`
- `FORECAST`
- `STOCK`
- `GOSSIP`
- `PRICE`

Each flashcard carries:
- `publicId`
- `UUID`
- `confidence`
- `impact`
- `weight`
- provenance/source links
- review state

UI/runtime contract:
- the UUID is also the canonical card permalink key for shared single-card routes at `/card/[cardId]`
- shared card pages are standalone, non-interactive views intended for focused review rather than workflow operations
- active workflow blueprints are synchronized into claimable `WORKFLOW_BLUEPRINT` pipeline jobs, so workflow configuration can directly steer local-AI execution
- enrichment waterfall policies now influence runtime product/competitor URL research provider selection instead of remaining passive config
- observability is no longer read-only; operators can write bounded queue/repair intents through the shared webapp surface, and the local AI system pulls and executes queue sync, score-repair escalation, and failed-job recovery from MongoDB Atlas
- workflow edits and repair actions are bridged through persisted worker commands; the webapp does not execute queue authority directly

Some flashcards are sourced from AI-harvested public research rather than direct user-entered rows. Those are still normal flashcards in storage, but their source lineage points at `Source` rows tagged with:

- `entityTag = "research-harvest"`
- `metadata.origin = "research-harvest"`

The Knowmore API exposes these as checklist-research cards so the UI can render them with a distinct visual treatment.

### 4. Delivery metrics

The worker now writes append-only runtime metrics to:

- `scripts/knowledge/runtime-metrics.ndjson`

The local control plane reads that file and exposes an hourly dashboard with:

- companies processed fully
- total new cards
- total new flashcards
- total new taskcards
- total new datacards
- per-company stacked totals for the same categories

### 3b. Research harvest

The worker can create new raw `Source` rows from topic-aligned public research.

This lane:

- starts from queue-owned synthesis and maintenance context
- runs bounded, diversified public search (parallelized for throughput)
- uses high-intent query patterns (reviews, comparisons, analysis) to improve yield
- requires externally evidenced findings before it persists anything
- writes new raw `Source` rows with research lineage metadata
- immediately reprocesses the affected company so those harvested rows can become flashcards and later feed checklist generation

This keeps internet-discovered knowledge inside the same unified raw-source pipeline instead of attaching it only as transient flashcard evidence.

### Shipped HiTL queue controls

The current human steering surface for repetitive local-AI work is the webapp `AI Queue` board at `/:companyId/pipeline`.

Current shipped controls:

- drag and drop jobs between `Now`, `Soon`, `Later`, and `Parked`
- drag and drop reordering within a queue column
- one-step `Reset to AI Only`

Behavior contract:

- manual drag/drop moves switch the affected jobs into `HUMAN_GUIDED`
- `Reset to AI Only` clears those manual overrides and returns scheduling to shared AI logic
- there is no separate compact tweak menu in the current shipped UI; the board itself is the tweak surface
- queue reads must return persisted `PipelineJob` rows only; loading the board must not trigger queue synchronization in the webapp layer

Current selection contract:

- queue priority is authoritative
- topic context is still used inside research and synthesis selection
- oldest-first fairness still appears inside bounded maintenance batches such as rescoring and revisit work
- weak relevance is allowed for candidate selection, but persistence still requires real external evidence

Current persistence contract:

- the lane may research a flashcard and still create zero datacards
- that is acceptable when public search returns no usable citations or only duplicates
- zero creation is no longer ambiguous because the probe and lane results now expose:
  - `flashcardsScanned`
  - `flashcardsResearched`
  - `topicMatchedFlashcards`
  - `topicFallbackFlashcards`
  - `queriesRun`
  - `citationsFetched`
  - `duplicateCitations`
  - `noPrimarySource`
  - `noCitations`

Probe contract:

- `npm run research:probe -- --minutes N` now runs through the worker's direct CLI path instead of a long-lived HTTP socket
- before spawning, the probe reads the live worker health endpoint so the research on/off flag matches the running local AI worker
- this makes the probe resilient to worker restarts and much closer to production behavior

### 4. NBA generation

The NBA generator reads:
- company context
- unified sources and uploaded files
- active topics
- active flashcards
- flashcard hashtags
- flashcard feedback
- task feedback

It creates `ChecklistTask` rows and stores `sourceFlashcardIds` so tasks can be traced back to the flashcards that supported them.

Current task-generation contract:

- **Strict Grounding**: Every task must be a direct consequence of provided flashcard evidence.
- **Exclusion of Generic Advice**: Tasks that could apply to any company without specific evidence (e.g., "optimize SEO") are explicitly banned unless backed by specific findings.
- **Feedback Loop Integration**: Generator strictly respects weighted signals (term/hashtag weights) from past annotations.
- task creation now runs earlier in the company cycle
- inside `processCompany`, the worker attempts recommendation generation before flashcard refresh and again after flashcard refresh
- this puts checklist delivery earlier in the loop without losing the ability to create tasks from newly refreshed flashcards
- the task generator now uses compact flashcard refs (`sourceFlashcardRefs`) in prompts rather than asking the model to echo raw UUIDs
- prompt context is intentionally smaller and more duplicate-aware:
  - fewer seed flashcards
  - stronger preference for actionable flashcard kinds
  - feedback patterns over long historical examples
  - explicit avoidance of archived checklist title duplication
  - explicit ban on template phrases like `Act on:` and `Turn the flashcard`

Task probe contract:

- `npm run task:probe -- --minutes N` runs task creation directly through the worker CLI path
- the probe uses the live worker health settings for task thresholds and local-model timeout config
- probe output reports:
  - `created`
  - `updated`
  - `activeFlashcards`
  - per-company totals
  - whether a run was skipped because a company had no active flashcards

## Feedback loops

### Flashcards

Knowmore flashcards support:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`
- `PIN`
- `HIDE`
- `MARK_WRONG`
- `REQUEST_REFRESH`
- `SUPPRESS_SOURCE`

These actions update:
- review status
- confidence delta
- weight delta
- optional manual title/body overrides
- durable correction events and bounded repair signals for the local worker

Declined flashcards are hidden from the Knowmore webapp feed.

### NBA tasks

checklist tasks support:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`
- `DELIVER`

These actions update:
- task status
- optional task title/description edits
- user annotation
- ICE score recalculation
- canonical worker feedback state, including stronger delivery reward propagation

### Durable Subject-Matter Memory

The worker implements a durable "Subject-Matter Memory" layer that extracts ground truths from user modifications:
- **Flashcard Corrections**: If a user rewrites a flashcard (`MODIFY_ACCEPT`), the content is captured as a durable fact.
- **Task Annotations**: Specific steering provided in task annotations is persisted as steering memory.
- **Self-Improvement Loop**: This memory is fed back into LLM prompts as "Known Truths" to prevent the worker from repeating past erroneous claims or using rejected framing.
- Memory is stored per-company in `scripts/knowledge/[companyId].json`.

### Weighted signal learning

The worker now implements explicit weighted learning from annotations:

- Actions have assigned business weights (e.g., `MODIFY_ACCEPT` > `ACCEPT`).
- Feedback is tokenized into positive and negative term/hashtag weights.
- Future flashcard and task candidates are scored against these patterns.
- Candidates falling below a net score threshold are suppressed from delivery.
- Weighting patterns and class summaries are persisted in the company `memory` layer and logged in `runtime-metrics.ndjson` for observability.

### Fairness and Runtime Verification

The worker now tracks processing duration and Yield consistency:
- **Duration Tracking**: Every company cycle captures `processingDurationMs`.
- **Fairness Verification**: A running audit of the last 30 processing samples is performed at the end of each cycle.
- **Starvation Detection**: The audit compares processing frequency, duration, and yield across companies.
- Reports are logged to `runtime-metrics.ndjson` with the type `fairness-verification-report`.


Current weight classes:
- `taskAccept`, `taskModifyAccept`, `taskDecline`, `taskAnnotation`
- `flashcardAccept`, `flashcardModifyAccept`, `flashcardDecline`, `flashcardRewrite`
- `hashtagUserAdd`, `hashtagUserRemove`, `hashtagAiAccept`, `hashtagAiReject`

### Intelligence Decay System

The worker implements a time-based decay system to ensure intelligence remains fresh and avoids context pollution:
- **STALE State**: Flashcards older than **30 days** since their last refresh are marked as `STALE`.
- **ARCHIVED State**: Flashcards older than **90 days** are moved to `ARCHIVED` status.
- **Confidence Decay**: Stale flashcards incur a penalty of **-10 confidence points** per 30-day interval, de-prioritizing them in decision loops.
- **Task Filtering**: `ARCHIVED` cards are strictly excluded from generating new NBA recommendations.
- **Memory Pruning**: `Subject-Matter Memory` entries older than **60 days** are pruned from the durable knowledge layer unless they are refreshed by newer evidence.
- Transitions and decay counts are reported in the `cleanup` lane metrics.

Task feedback is also applied back onto the linked source flashcards.
Task feedback now enters the canonical `Feedback` stream directly from the webapp task surface, so DELIVER reward propagation and lifecycle updates are processed by the worker rather than only by ad hoc UI patches.

## Continuous improvement loop

checklist is evolving from a generation pipeline into an improvement pipeline.

The next contract is:

1. the worker scans eligible flashcards and NBA tasks
2. it selects the next item by oldest meaningful modification timestamp
3. it prioritizes items with stronger business value
4. it runs bounded research to improve evidence quality
5. it updates the item only when the new result is materially better
6. it stores evidence deltas, timestamps, and improvement history

Important:

- `oldest` means oldest modified
- `oldest` does not mean oldest created

The detailed program and issue breakdown live in:

- `docs/CONTINUOUS_IMPROVEMENT_PLAN.md`

## ICE scoring

The current canonical scoring contract is:

```text
Impact: 1-10 visible range
Confidence: 1-10 visible range
Ease: 1-10 visible range
Internal score math: decimal precision through shared scoreProfile
Task ICE = impact * confidence * ease
Task range: 1-1000
```

Important:

- the app no longer uses mixed confidence scales
- task generation/refinement must normalize through `src/lib/scoring-contract.js`
- score generation persists `scoreProfile` provenance: agent proposal, calibrated factor traces, and final blended score
- task and knowledge scoring are history-aware: accepted, declined, modified, and delivered company outcomes are valid calibration inputs
- task scoring is grounded by source strength plus task specificity, urgency, and delivery-difficulty signals
- task `ease` is calibrated from dependencies, coordination burden, expertise requirement, time-to-value, and delivery history
- tactical placement uses the shared blended priority profile, not raw ICE alone
- blended priority combines ICE, quality, urgency, freshness, human signal, risk, lifecycle state, and memory signal
- `priorityProfile` exposes component-level reasons so ranking is inspectable
- operator drag/drop anchors remain explicit human signal and are preserved ahead of AI-only ordering
- periodic rescoring runs oldest-updated-first across active card layers
- score clustering is observable through the dashboard score-health panel and `npm run audit:score-health`
- bounded historical rescoring uses `scripts/repair-ice-scores.js` so flashcards and taskcards can be safely resynchronized onto the live scoring contract
- the scoring-accuracy overhaul is considered complete architecture work; remaining warnings are maintenance inputs for observability and repair
- flashcards now also persist lineage-family and duplicate-cluster context so repair, suppression, and future traceability work are not task-only capabilities
- the Refiner now supports split-aware task refinement in addition to merge, suppress, enrich, and standard rewrite paths

## Budget governor

The first AI workload budget-governor slice is an observability-first control loop:

- `AiWorkloadUsage` records estimated workload units, runtime, retries, request counts, and cost dimensions for queue jobs and observability actions
- `BudgetPolicy` records per-company feature thresholds and explicit controls such as throttle, batch, cache/reuse, review-required, or pause
- `BudgetEvent` records reviewable budget pressure and applied controls with evidence and value assessment
- the pipeline queue records usage on completed and failed queue jobs so retry storms and high-value work can be separated
- Observability shows budget pressure, usage by feature, recommendations, and bounded controls without silently overriding human-guided scheduling or critical safety/evidence work

## Delivery modes

There is one supported hosted execution mode:

1. `indirect catch-up`
   - the online app only writes to and reads from MongoDB Atlas
   - the local AI worker polls the shared database
   - the worker writes flashcards and downstream updates back into the same database

## Current limitations

- public search collection is opportunistic and not fully deterministic
- evidence-only publication is still being tightened for `NEWS`
- provenance/version tagging is not yet attached to every generated artifact version
- the webapp does not contact the local AI worker directly; if results are missing, check the local worker process, database connectivity, and Ollama connectivity
- public research harvest is bounded and may yield zero new sources when evidence quality is too weak

## Operational rule

Whenever code changes the online/local contract, update:
- `README.md`
- `docs/ONBOARDING.md`
- this file
- `docs/CONTINUOUS_IMPROVEMENT_PLAN.md` when the continuous improvement contract changes

# checklist Local AI Pipeline

This document describes the current shipped behavior of the checklist online/local AI pipeline.

## System split

checklist has two cooperating parts:

1. `online webapp`
   - user-facing
   - runs on Vercel
   - captures raw data, topics, hashtags, and feedback

2. `local AI layer`
   - fetches / enriches source evidence
   - researches around active topics
   - generates flashcards
   - supports checklist generation

The database is the shared persistence layer between them.

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

The worker currently schedules work as a serial per-company cycle:

1. poll the company
2. process user feedback and update durable memory (Fast-Path)
3. run `researchHarvest` (Topic-driven)
4. revisit one oldest task
5. revisit one oldest flashcard
6. replay one feedback slice
7. retry one fail-safe queue slice through the secondary local model
8. maintain one hashtag slice
9. run one cleanup slice
10. backfill one oldest citation / conflict slice
11. revisit one oldest unresolved modified candidate
12. revisit one oldest declined high-potential candidate

After a company completes that cycle, it waits for the configured company-cycle cooldown before becoming due again.

Two runtime rules now matter for delivery:

- generation is `done is better than perfect`: low-score but valid cards are allowed through so later cycles can improve them
- malformed or empty JSON from the primary model no longer silently kills delivery; recommendation/task work is queued for a secondary local model retry
- source-backed knowledge must stay explainable even when raw URLs drift; durable citation snapshots are part of the worker contract

Current enrichment outputs may include:
- conclusions
- evaluations
- judgments
- recommendations
- comparisons
- pricing signals
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
- observability is no longer read-only; operators can trigger bounded queue sync, score-repair escalation, and failed-job recovery through the shared webapp control surface

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

The worker can now create new raw `Source` rows from topic-aligned public research.

This lane:

- starts from active flashcards plus active Topics
- runs bounded, diversified public search (parallelized for throughput)
- uses high-intent query patterns (reviews, comparisons, analysis) to improve yield
- requires externally evidenced findings before it persists anything
- writes new raw `Source` rows with research lineage metadata
- immediately reprocesses the affected company so those harvested rows can become flashcards and later feed checklist generation

This keeps internet-discovered knowledge inside the same unified raw-source pipeline instead of attaching it only as transient flashcard evidence.

### Shipped HiTL queue controls

The current human steering surface for repetitive local-AI work is the webapp `Worker Queue` board at `/:companyId/pipeline`.

Current shipped controls:

- drag and drop jobs between `Now`, `Soon`, `Later`, and `Parked`
- drag and drop reordering within a queue column
- one-step `Reset to AI Only`

Behavior contract:

- manual drag/drop moves switch the affected jobs into `HUMAN_GUIDED`
- `Reset to AI Only` clears those manual overrides and returns scheduling to shared AI logic
- there is no separate compact tweak menu in the current shipped UI; the board itself is the tweak surface

Current selection contract:

- **Topic-first Planning**: the lane now iterates through active `Topic` rows as the primary unit of work.
- For each topic, it identifies the most relevant and stale `Flashcard` candidates to use as research seeds.
- This ensures balanced coverage across all prioritized focus areas, rather than just researching the oldest overall flashcards.
- If no direct topic matches exist for a chosen flashcard, the highest-priority active Topics are used as research context.
- this follows the `done is better than perfect` rule for research candidate selection: weak relevance is allowed, but persistence still requires real external evidence.

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

It creates `NBAItem` rows and stores `sourceFlashcardIds` so tasks can be traced back to the flashcards that supported them.

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

These actions update:
- review status
- confidence delta
- weight delta
- optional manual title/body overrides

Declined flashcards are hidden from the Knowmore webapp feed.

### NBA tasks

checklist tasks support:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

These actions update:
- task status
- optional task title/description edits
- user annotation
- ICE score recalculation

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
Impact: 1-10 integer
Confidence: 1-10 integer
Ease: 1-10 integer
Task ICE = impact * confidence * ease
Task range: 1-1000
```

Important:

- the app no longer uses mixed confidence scales
- task generation/refinement must normalize through `src/lib/scoring-contract.js`
- task scoring is grounded by source strength plus task specificity, urgency, and complexity signals
- tactical placement uses the shared blended priority profile, not raw ICE alone
- blended priority combines ICE, quality, urgency, freshness, human signal, risk, lifecycle state, and memory signal
- `priorityProfile` exposes component-level reasons so ranking is inspectable
- operator drag/drop anchors remain explicit human signal and are preserved ahead of AI-only ordering
- periodic rescoring runs oldest-updated-first across active card layers
- score clustering is observable through the dashboard score-health panel and `npm run audit:score-health`

## Evaluation bench

The first recommendation and agent evaluation contract is advisory:

- `src/lib/evaluation-bench.ts` owns seeded synthetic fixture cases and rubrics for grounded answers, search ranking, KPI pulse behavior, workflow replay, competitive-change briefings, data-readiness warnings, and recommendation generation
- `/api/evaluations` runs baseline-vs-candidate comparisons behind company membership checks
- replay does not mutate production company data by default
- failed gates can be explicitly published as `EVAL_GATE_FAILED` outcome events so Observability and pre-production evals share vocabulary
- high-risk failed cases return `REVIEW_REQUIRED` or `BLOCK` promotion metadata before future enforcement is introduced

## Content generation

The first content-generation contract is draft-only:

- `src/lib/content-generation.ts` derives channel-specific marketing copy from existing company, product, competitor, goal, topic, and task context
- `/api/content-generation` persists generated outputs as `CreativeDraft` records and records generation/audit events
- generated bundles include five email subject lines, Facebook/Google/LinkedIn ad copy, Twitter/LinkedIn/Facebook social posts, and landing-page hero/benefit/CTA sections
- tone selection is explicit and bounded to clear, bold, executive, friendly, or technical
- no automated posting, image generation, or multi-language output is part of this release

## Athlete app

The first athlete app contract is a daily recording loop beside the coach/operator app:

- `AthleteActivityLog` stores athlete-entered activity, wellness/readiness, sleep, soreness, stress, mood, hydration, body weight, pain/nutrition notes, duration, intensity, notes, completion state, and optional linked checklist work
- `/api/athlete` exposes the current athlete's assigned work plus their daily record behind normal company membership checks, with an admin-scoped team summary mode for coaches
- `/:companyId/athlete` lets athletes see what the coach set, record training/recovery/nutrition/wellness/match/note entries, and mark assigned work complete
- `/:companyId/athletes` lets coaches review team daily records, completion evidence, readiness, load, sleep, soreness, and pain flags
- completed assigned work writes audit/outcome events and archives the linked checklist item as completed
- wearable integrations, medical claims, public sharing, and payment flows are out of scope for this first slice

## Budget governor

The first AI workload budget-governor slice is an observability-first control loop:

- `AiWorkloadUsage` records estimated workload units, runtime, retries, request counts, and cost dimensions for queue jobs, evaluation replays, content generation, and observability actions
- `BudgetPolicy` records per-company feature thresholds and explicit controls such as throttle, batch, cache/reuse, review-required, or pause
- `BudgetEvent` records reviewable budget pressure and applied controls with evidence and value assessment
- the pipeline queue records usage on completed and failed queue jobs so retry storms and high-value work can be separated
- evaluation and content-generation APIs record usage when operators run those surfaces
- Observability shows budget pressure, usage by feature, recommendations, and bounded controls without silently overriding human-guided scheduling or critical safety/evidence work

## Voice of customer

The first VoC signal-fusion slice makes customer language durable and searchable:

- `VocSignal` stores reviews, support notes, survey responses, sales objections, social/listening snippets, cancellation reasons, interview notes, and manual notes with provenance metadata
- `voc-signal-fusion.ts` normalizes channel/sentiment/urgency and groups signals into transparent deterministic themes
- `VocTheme` stores affected segments, supporting excerpts, sentiment mix, confidence, recurrence, freshness, and review state
- `VocActionBrief` stores root-cause hypotheses and recommended next work backed by the theme evidence excerpts
- `/api/voc` records signals and recomputes themes/briefs behind company membership checks
- `/:companyId/voc` gives operators a customer-voice surface beside Knowmore, Goals, Checklist, and Search & Answers
- search and grounded answers include customer themes and briefs as retrievable company context

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

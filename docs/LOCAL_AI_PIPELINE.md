# Checklist Local AI Pipeline

This document describes the current shipped behavior of the Checklist online/local AI pipeline.

## System split

Checklist has two cooperating parts:

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
2. revisit one oldest task
3. run `researchHarvest`
4. revisit one oldest flashcard
5. replay one feedback slice
6. retry one fail-safe queue slice through the secondary local model
7. maintain one hashtag slice
8. run one cleanup slice

After a company completes that cycle, it waits for the configured company-cycle cooldown before becoming due again.

Two runtime rules now matter for delivery:

- generation is `done is better than perfect`: low-score but valid cards are allowed through so later cycles can improve them
- malformed or empty JSON from the primary model no longer silently kills delivery; recommendation/task work is queued for a secondary local model retry

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

Some flashcards are sourced from AI-harvested public research rather than direct user-entered rows. Those are still normal flashcards in storage, but their source lineage points at `Source` rows tagged with:

- `entityTag = "research-harvest"`
- `metadata.origin = "research-harvest"`

The Knowmore API exposes these as sovereign-research cards so the UI can render them with a distinct visual treatment.

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
- immediately reprocesses the affected company so those harvested rows can become flashcards and later feed Checklist generation

This keeps internet-discovered knowledge inside the same unified raw-source pipeline instead of attaching it only as transient flashcard evidence.

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

Checklist tasks support:
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

Current weight classes:
- `taskAccept`, `taskModifyAccept`, `taskDecline`, `taskAnnotation`
- `flashcardAccept`, `flashcardModifyAccept`, `flashcardDecline`, `flashcardRewrite`
- `hashtagUserAdd`, `hashtagUserRemove`, `hashtagAiAccept`, `hashtagAiReject`

Task feedback is also applied back onto the linked source flashcards.

## Continuous improvement loop

Checklist is evolving from a generation pipeline into an improvement pipeline.

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

The current task scoring contract is:

```text
Impact: 0-10
Confidence: 0-100, multiplied as confidence/10
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

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

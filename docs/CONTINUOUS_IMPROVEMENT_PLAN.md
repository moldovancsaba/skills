# Continuous Improvement Plan

Status note:
- this document defines the next implementation program for continuous improvement
- it extends the existing `knowmore` and local AI pipeline contracts
- it does not replace the current shipped behavior documented in:
  - `README.md`
  - `docs/LOCAL_AI_PIPELINE.md`
  - `docs/KNOWMORE_DELIVERY_PLAN.md`

## Objective

Turn checklist into a durable improvement system that revisits stale knowledge and stale NBA tasks over time, refreshes them with better evidence, and prioritizes work based on business value.

The most important rule is:

- `oldest` means oldest meaningful modification timestamp
- `oldest` does not mean oldest creation timestamp

## Why This Matters

checklist already has:

- raw source capture in the online app
- a local AI worker
- flashcards in `knowmore`
- NBA task generation
- explicit research and evidence storage

What it still lacks is a disciplined contract for deciding what to improve next.

Without that layer:

- stale but important flashcards remain weak too long
- old NBA tasks do not get revisited systematically
- day-by-day learning does not become a managed backlog
- the system can generate output without compounding quality

This program adds that missing layer.

## Target Outcome

checklist should behave like a persistent business researcher and improvement engine:

1. choose the next eligible item to improve
2. prefer the oldest modified item among eligible candidates
3. weigh business value before spending research effort
4. fetch better sources and compare new evidence to old evidence
5. improve flashcards or tasks only when the new result is materially better
6. store what changed, why it changed, and which evidence justified it
7. keep doing this over time

## High-Level System Design

```text
┌────────────────────────────────────────────────────────────┐
│ Online checklist App                                      │
│ - raw data entry                                          │
│ - flashcard review and correction                         │
│ - NBA task review and correction                          │
│ - freshness / improvement visibility                      │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ reads / writes
                               ▼
┌────────────────────────────────────────────────────────────┐
│ MongoDB Database                                           │
│ - source data                                             │
│ - flashcards                                              │
│ - NBA tasks                                               │
│ - evidence snapshots                                      │
│ - freshness metadata                                      │
│ - improvement history                                     │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ scheduled pull / update
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Local checklist Worker                                    │
│ - eligibility scan                                        │
│ - oldest-modified-first selection                         │
│ - business-value scoring                                  │
│ - bounded internet research                               │
│ - flashcard improvement loop                              │
│ - NBA task improvement loop                               │
│ - evidence delta and audit logging                        │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ local inference
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Ollama                                                    │
│ - `gemma4:latest`                                         │
└────────────────────────────────────────────────────────────┘
```

## Improvement Pipeline

### 1. Candidate scan

The worker periodically scans:

- active flashcards
- active NBA tasks
- correction requests
- feedback-linked records
- stale research windows

It computes eligibility using:

- `lastModifiedAt`
- review state
- user override state
- recent improvement cooldown
- source availability
- suppression flags

### 2. Selection

Selection must be deterministic and auditable.

Primary ordering:

1. eligible items only
2. highest business-value band
3. oldest meaningful modification timestamp
4. stable tie-breaker such as UUID

Important:

- recently created but recently edited items are not stale
- very old items that were meaningfully updated yesterday are not next in line
- the system optimizes freshness of meaningful value, not age of records

### 3. Research and evidence refresh

For the chosen item, the worker runs a bounded research pass:

- reuse existing linked sources
- revisit prior public URLs
- discover a small number of new candidate sources
- fetch, extract, normalize, and score usable evidence
- reject low-signal, duplicate, or weakly attributable evidence

Research must remain:

- source-backed
- bounded
- explicit
- auditable

### 4. Improvement decision

The worker compares old state and new state.

Improve only if there is material gain such as:

- stronger evidence
- fresher evidence
- better contradiction handling
- better business recommendation quality
- clearer ROI path
- more actionable task framing

If the new evidence is not materially better:

- do not rewrite for cosmetic reasons
- update freshness metadata only when justified
- keep the old item stable

### 5. Persistence

The worker writes:

- refreshed flashcard or task content
- updated evidence payload
- source links
- improvement history
- reason for change
- timestamps
- business-area tags
- confidence changes
- freshness state

### 6. User visibility

The online app should expose:

- last improved at
- last researched at
- freshness state
- improvement count
- business-area classification
- evidence-backed rationale

## Business-Value Priority Model

Improvement selection must favor business value over generic churn.

The system should classify and score impact using bounded business divisions:

- `operations`
- `development`
- `financial`
- `sales`
- `marketing`
- `customer`
- `product`
- `strategy`

The worker should prefer items that improve:

- company ROI
- competitiveness
- revenue growth
- conversion quality
- cost reduction
- operational leverage
- strategic differentiation

## Data and Metadata Requirements

The implementation should add or standardize the following concepts across flashcards and NBA tasks:

- `lastModifiedAt`
- `lastImprovedAt`
- `lastResearchedAt`
- `improvementCount`
- `improvementStatus`
- `businessValueScore`
- `businessArea`
- `improvementReason`
- `evidenceDelta`
- `refreshEligibleAt`

If the current schema already stores equivalent data, prefer extending it rather than creating duplicate meaning.

## Guardrails

- Never replace explicit user corrections with autonomous rewrites.
- Never run unbounded crawling.
- Never hide evidence deltas.
- Never refresh by creation time when modification time is the actual freshness signal.
- Never let background improvement break the webapp if the local worker is delayed.

## Atomic Delivery Issues

The implementation is broken into the following reviewable issues in `checklistsquad/checklist`:

1. `#81` Continuous Improvement: End-to-end oldest-modified knowledge and task refresh system
2. `#82` Continuous Improvement: Add freshness and oldest-modified selection model
3. `#83` Continuous Improvement: Add business-value scoring and division taxonomy
4. `#84` Continuous Improvement: Build flashcard improvement loop for `knowmore`
5. `#85` Continuous Improvement: Build NBA task improvement loop
6. `#86` Continuous Improvement: Add scheduled refresh and reminder automation
7. `#87` Continuous Improvement: Add evidence-delta logging and operator controls
8. `#88` Continuous Improvement: Expose freshness and improvement state in APIs and UI

Related existing issues that this plan builds on:

- `#62` Knowmore umbrella
- `#66` local flashcard extraction and refresh
- `#67` feedback into flashcard scoring
- `#68` flashcard read APIs
- `#69` Knowmore page UI
- `#70` observability and recovery
- `#71` citation snapshots and conflict handling
- `#72` operator repair and reprocess controls
- `#73` user correction controls
- `#78` flashcard provenance
- `#79` NBA provenance
- `#80` local sync / brain provenance

## Recommended Execution Order

1. `#82` freshness and oldest-modified selection model
2. `#83` business-value scoring and division taxonomy
3. `#84` flashcard improvement loop
4. `#85` NBA task improvement loop
5. `#86` scheduled refresh and reminder automation
6. `#87` evidence-delta logging and operator controls
7. `#88` API and UI visibility

## Acceptance Standard

The program is only complete when all of the following are true:

- the worker can choose the next item by oldest meaningful modification time
- business-value ranking influences which stale item gets attention first
- flashcards and NBA tasks can both be improved with bounded research
- evidence deltas are stored and reviewable
- user corrections remain authoritative
- operators can inspect and rerun improvements safely
- the online app shows freshness and improvement state clearly

## Project Board Note

The execution issues are intended for:

- [checklist - From IDEA to LIVE](https://github.com/orgs/checklistsquad/projects/3)

If project insertion fails from the CLI, treat it as an org-permission problem rather than a planning problem. The implementation plan remains valid and should still be tracked from the linked issues and this document.

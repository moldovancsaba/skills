# CHECKLIST Local AI Planner LLD

This document defines the target low-level design for the deterministic local AI planner introduced under GitHub umbrella issue `#191`.

It is a design-and-implementation contract for the planner rollout.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)

Important:

- this document describes the target planner architecture
- current shipped behavior still includes the broader `COMPANY_SYNTHESIS` queue path
- implementation work must converge runtime behavior onto this planner instead of letting both models drift in parallel

## 1. Purpose

The planner exists to make local AI work deterministic for both sparse and mature companies.

The planner replaces broad “synthesis as catch-all” behavior with explicit inventory, lane, and maintenance rules.

Primary goals:

- bootstrap sparse companies without manual rescue
- maintain mature companies without starving sparse ones
- enforce weakest-upstream quality ceilings
- respect human lane overrides
- kill stalled work safely
- make worker reasoning observable

## 2. Canonical Terms

### 2.1 Company operating modes

- `INACTIVE`
  - company has `0` datacards
  - company is visible in telemetry
  - company is not an active planner execution target

- `BOOTSTRAP`
  - company has at least `1` datacard
  - company is below one or more required inventory targets

- `MAINTENANCE`
  - company has met minimum bootstrap targets and should receive oldest-first upkeep work

### 2.2 Canonical task lanes

Stored lanes:

- `IDEABANK`
- `ROADMAP`
- `BACKLOG`
- `TODO`
- `CHECKLIST`

Display rule:

- `Next` is UI wording only
- runtime, persistence, APIs, and planner logic must use stored lane `TODO`

### 2.3 Inventory targets

Minimum active task inventory per company:

- `CHECKLIST >= 3`
- `TODO >= 3`
- `BACKLOG >= 3`
- `ROADMAP >= 3`
- `IDEABANK >= 3`

Minimum active flashcard inventory per company:

- `FLASHCARDS >= 10`

Activation threshold:

- `DATACARDS >= 1`

### 2.4 Quality ceiling

Generated output cannot exceed the weakest upstream input status.

Status ordering:

- `DRAFT`
- `CHECKED`
- `VERIFIED`

Rules:

- if any upstream input is `DRAFT`, output cannot exceed `DRAFT`
- output may become `CHECKED` only if all upstream inputs are at least `CHECKED`
- output may become `VERIFIED` only if all upstream inputs are `VERIFIED`

This rule applies to:

- datacards -> flashcards
- flashcards -> taskcards

## 3. Runtime Split

The planner runs in the existing local worker runtime:

- `guardian`
  - watchdog only
- `sync`
  - queue-owned mutating worker
- `status-server`
  - observability/control read model

The planner does not create a second mutation loop.

Planner execution remains queue-owned.

## 4. Planner Job Taxonomy

The planner decomposes broad synthesis into explicit work families.

Target job families:

- `ENSURE_CHECKLIST_MINIMUM`
- `ENSURE_TODO_MINIMUM`
- `ENSURE_BACKLOG_MINIMUM`
- `ENSURE_ROADMAP_MINIMUM`
- `ENSURE_IDEABANK_MINIMUM`
- `ENSURE_FLASHCARD_MINIMUM`
- `RESEARCH_BACKFILL`
- `REFRESH_FLASHCARDS`
- `REFRESH_TASKS`
- `REFRESH_DATACARDS`
- `REFRESH_GOALS`
- `FEEDBACK_RECONCILIATION`
- `FRONTIER_RECOMPUTE`
- `SCORE_ALERT_REPAIR`
- `FULL_MAINTENANCE`

Notes:

- `COMPANY_SYNTHESIS` is legacy orchestration and should be reduced or retired as the explicit planner jobs take over
- planner jobs must record machine-readable reasons for claim and execution

## 5. Company Classification

Planner entrypoint:

`classifyCompanyOperatingMode(companyId)`

Inputs:

- active datacard count
- active flashcard count
- per-lane active task counts
- stale backlog indicators
- manual override / cooldown presence

Classification:

- if `datacards = 0` -> `INACTIVE`
- else if any lane is below target or flashcards are below target -> `BOOTSTRAP`
- else -> `MAINTENANCE`

## 6. Bootstrap Planner Flow

Bootstrap mode is inventory-first.

### 6.1 Lane refill order

The planner fills downstream lanes first, then pulls from upstream lanes:

1. ensure `CHECKLIST >= 3`
2. ensure `TODO >= 3`
3. ensure `BACKLOG >= 3`
4. ensure `ROADMAP >= 3`
5. ensure `IDEABANK >= 3`

### 6.2 Promotion order

When selecting tasks from an upstream lane, use:

1. highest `iceScore`
2. if tied, higher `ease`
3. if tied, higher `confidence`
4. if tied, alphabetical `title`

### 6.3 New task default lane

All new generated taskcards enter:

- `IDEABANK`

The planner may then promote them further in the same cycle if lower lanes are still under target.

### 6.4 Fallback chain

If lane promotion cannot satisfy targets:

1. generate taskcards from eligible flashcards
2. if insufficient, generate flashcards from datacards
3. if datacards are not useful enough, research from datacards and create new datacards
4. if no datacards exist, keep company `INACTIVE`

### 6.5 Bootstrap stop conditions

A bootstrap cycle stops when one of these becomes true:

- all active targets are satisfied
- upstream resources are exhausted
- a timeout aborts the current work item
- worker concurrency/budget guard prevents more work

## 7. Maintenance Planner Flow

Maintenance mode is oldest-first and bounded.

Per cycle entity refresh counts:

- flashcards: `3`
- taskcards: `2`
- datacards: `1`
- goalcards: `1`

Maintenance actions may include:

- web research around the card content
- content rewrite / refinement / grammar / style improvement
- hashtag repair
- score recomputation
- lane or priority reconsideration where allowed

Task maintenance may promote into `CHECKLIST` if warranted by planner rules.

## 8. Manual Override Protection

Human lane changes are authoritative timing signals.

Target stored metadata:

- `manualLaneOverrideAt`
- `manualLaneOverrideBy`
- `manualLaneOverrideTarget`
- `manualLaneCooldownUntil`

Contract:

- AI may promote a manually moved task earlier if required by downstream targets
- AI must not demote a manually moved task for `7 days`
- repeated manual moves refresh the cooldown window

## 9. Timeout And Recovery

Generation work must not stall indefinitely.

Target timeout policy:

- per generation work item timeout: `120000ms`

Applies to:

- flashcard generation
- task generation
- long-running refine/evaluate substeps where bounded execution is required

On timeout:

- abort current work item
- mark timeout reason in telemetry
- release or recover queue state safely
- continue to next candidate or next planner job

Stale `RUNNING` records must remain recoverable after crash or forced stop.

## 10. Data And State Changes

### 10.1 Task state metadata

Expected task metadata additions or clarified usage:

- `kanbanColumn`
- `sortOrder`
- `candidateState`
- `scoreProfile`
- `manualLaneOverrideAt`
- `manualLaneOverrideBy`
- `manualLaneOverrideTarget`
- `manualLaneCooldownUntil`
- planner reasoning fields if not already available through events/metadata

### 10.2 Planner contract module

Add one shared planner contract module that defines:

- lane constants
- target counts
- status ordering
- promotion comparator
- timeout constants
- company mode helpers

This module must be consumed by:

- queue logic
- frontier logic
- worker planner jobs
- APIs that expose lane/state semantics

### 10.3 Quality ceiling helper

Add one shared helper:

`resolveWeakestUpstreamStatus(statuses[])`

Usage:

- flashcard generation
- flashcard refinement/evaluation write ceiling
- task generation
- task refinement/evaluation write ceiling

## 11. Module Design

Recommended modules:

- `src/lib/planner-contract.ts`
  - canonical constants and helpers

- `scripts/lib/planner/company-mode.js`
  - company classification

- `scripts/lib/planner/lane-refill.js`
  - lane target enforcement

- `scripts/lib/planner/status-ceiling.js`
  - weakest-upstream quality ceiling

- `scripts/lib/planner/bootstrap.js`
  - task/flashcard/datacard fallback orchestration

- `scripts/lib/planner/maintenance-cycle.js`
  - oldest-first maintenance orchestration

- `scripts/lib/planner/timeout.js`
  - bounded execution wrapper and timeout recording

- `scripts/lib/planner/telemetry.js`
  - planner-specific telemetry envelope builders

The exact filenames may vary, but the responsibilities must remain separated.

## 12. Queue Integration

Queue claim priority must be derived from unmet contractual needs, not generic churn.

Priority intent:

- bootstrap lane deficit
- bootstrap flashcard deficit
- datacard research insufficiency
- explicit stale maintenance work
- score-health repair

Sparse-company fairness remains required:

- untouched bootstrap companies must not be starved by repeated mature-company churn

## 13. Frontier Integration

Current frontier logic is percentile-driven.

Target change:

- frontier becomes a deterministic lane organizer under planner control
- percentile-only placement must not remain the primary organizer for active planning lanes

Allowed role for percentile or blended ranking:

- tie-breaking inside candidate pools
- secondary ordering
- explanation metadata

Not allowed:

- overriding hard lane minimums

## 14. Observability

The planner must expose enough runtime evidence to diagnose blocked companies quickly.

Required health/reporting additions:

- live worker build identity
- company operating mode
- unmet lane targets by company
- unmet flashcard target by company
- timeout events
- generation fallback reason
- quality-ceiling block reason
- manual override cooldown block reason

## 15. Tests And Regression Gates

Required test classes:

- sparse company bootstrap from datacards to flashcards to tasks
- weakest-upstream status ceiling for flashcards
- weakest-upstream status ceiling for tasks
- deterministic promotion comparator
- manual override anti-demotion window
- timeout recovery
- inactive-company gating

Recommended fixtures:

- `inactive-company`
- `datacard-only sparse company`
- `knowledge-rich task-empty company`
- `mature company with stale assets`

## 16. Rollout Sequence

Recommended implementation order:

1. contract/constants/schema-facing metadata
2. queue taxonomy and company classification
3. lane refill engine
4. status ceiling propagation
5. bootstrap task generation fallback
6. datacard research backfill
7. manual override cooldown
8. maintenance cadence
9. timeout recovery
10. observability
11. regression gate

## 17. Non-Goals

This planner LLD does not authorize:

- unrelated UI redesign
- reopening parked self-learning scope
- speculative ranking ML systems
- parallel non-queue mutation loops
- implicit widening back to generic synthesis behavior

## 18. Governing Issues

GitHub implementation umbrella:

- [#191 Local AI Planner: deterministic bootstrap and maintenance workflow umbrella](https://github.com/sovereignsquad/checklist/issues/191)

Child execution issues:

- [#192](https://github.com/sovereignsquad/checklist/issues/192)
- [#193](https://github.com/sovereignsquad/checklist/issues/193)
- [#194](https://github.com/sovereignsquad/checklist/issues/194)
- [#195](https://github.com/sovereignsquad/checklist/issues/195)
- [#196](https://github.com/sovereignsquad/checklist/issues/196)
- [#197](https://github.com/sovereignsquad/checklist/issues/197)
- [#198](https://github.com/sovereignsquad/checklist/issues/198)
- [#199](https://github.com/sovereignsquad/checklist/issues/199)
- [#200](https://github.com/sovereignsquad/checklist/issues/200)
- [#201](https://github.com/sovereignsquad/checklist/issues/201)
- [#202](https://github.com/sovereignsquad/checklist/issues/202)

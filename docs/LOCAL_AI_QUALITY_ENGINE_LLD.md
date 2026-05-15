# CHECKLIST Local AI Quality Engine LLD

This document defines the shipped low-level design for the Local AI Quality Engine introduced under GitHub umbrella issue `#203`.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [docs/LOCAL_AI_PLANNER_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PLANNER_LLD.md)

## 1. Purpose

The quality engine exists to improve card quality after the planner made the system non-empty and stable.

The planner guarantees minimum viable inventory and fair execution.
The quality engine improves:

- factual freshness
- opportunity discovery
- linguistic quality
- actionability
- duplicate suppression
- feedback-driven regeneration

## 2. Canonical Quality Dimensions

The shipped scoring contract separates quality into explicit dimensions:

- evidence quality
- strategic value
- linguistic quality
- actionability

These dimensions must remain distinct from:

- visible ICE
- tactical placement
- lifecycle state

## 3. Job Taxonomy

The quality engine uses explicit queue jobs:

- `MINE_FLASHCARD_OPPORTUNITIES`
- `MINE_TASK_OPPORTUNITIES`
- `FEEDBACK_PRESSURE_REGENERATION`

These run beside the planner bootstrap and maintenance families.

## 4. Research Policy

Internet research is a first-class policy engine, not a best-effort side effect.

The research policy is applied during:

- datacard refresh
- flashcard refresh
- task refresh
- flashcard creation when upstream evidence is sparse or stale
- task creation when upstream knowledge is stale, weak, or strategically uncertain

The governing module is:

- `scripts/lib/planner/research-policy.js`

## 5. Opportunity Mining

Inventory minimums do not stop opportunity discovery.

The quality engine revisits:

- datacards to discover new flashcard opportunities
- flashcards to discover new task opportunities

Opportunity mining is governed by:

- research freshness
- evidence quality
- novelty score
- duplicate-cluster history
- feedback pressure

## 6. Novelty And Duplicate Suppression

The quality engine must not publish redundant cards simply because more source material exists.

Before publish, candidates are evaluated for:

- near-duplicate similarity
- duplicate-cluster collision
- weak incremental value over existing cards
- poor novelty score

Blocked candidates record machine-readable telemetry.

The governing module is:

- `scripts/lib/planner/novelty.js`

## 7. Editorial Gate

Factual correctness and linguistic quality are separate concerns.

The editorial gate runs after create and refresh flows to improve:

- grammar
- tone
- clarity
- title sharpness
- redundancy removal
- action framing

The editorial gate may downgrade or block weak outputs and must record why.

The governing module is:

- `scripts/lib/planner/editorial-gate.js`

## 8. Feedback Pressure

User feedback is not only a one-time event handler.

The quality engine derives recurring pressure from:

- accept signals
- decline signals
- deliver signals
- manual edits
- refresh requests
- suppress-source actions

That pressure influences:

- regeneration priority
- re-research priority
- family-level suppression
- maintenance urgency

The governing module is:

- `scripts/lib/planner/feedback-pressure.js`

## 9. Everyday Worker Cadence

The shipped quality cadence inside the queue-owned worker is:

1. feedback reconciliation and repair intents
2. inventory/bootstrap enforcement
3. flashcard opportunity mining
4. task opportunity mining
5. oldest-first maintenance refresh
6. feedback-pressure regeneration
7. frontier recompute and intelligence snapshot refresh

This cadence is bounded by the existing planner timeout and fairness rules.

## 10. Observability

Quality-engine observability is persisted through:

- `IntelligenceSnapshot`
- planner telemetry events
- worker build identity
- observability page read models

Required visible evidence includes:

- unmet inventory targets
- timeout events
- novelty blocks
- editorial downgrades
- quality-ceiling blocks
- feedback-pressure blocks and regenerations

## 11. Regression Gates

The shipped regression gate includes:

- `scripts/test-quality-contract.js`
- `scripts/test-research-policy.js`
- `scripts/test-novelty.js`
- `scripts/test-feedback-pressure.js`
- `scripts/test-editorial-gate.js`

These are required maintenance guards for further quality-engine changes.

## 12. Governing Issues

GitHub implementation umbrella:

- [#203 Local AI Quality Engine: opportunity mining, editorial quality, and research-backed regeneration umbrella](https://github.com/sovereignsquad/checklist/issues/203)

Child execution issues:

- [#204](https://github.com/sovereignsquad/checklist/issues/204)
- [#205](https://github.com/sovereignsquad/checklist/issues/205)
- [#206](https://github.com/sovereignsquad/checklist/issues/206)
- [#207](https://github.com/sovereignsquad/checklist/issues/207)
- [#208](https://github.com/sovereignsquad/checklist/issues/208)
- [#209](https://github.com/sovereignsquad/checklist/issues/209)
- [#210](https://github.com/sovereignsquad/checklist/issues/210)
- [#211](https://github.com/sovereignsquad/checklist/issues/211)
- [#212](https://github.com/sovereignsquad/checklist/issues/212)

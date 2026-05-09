# CHECKLIST Roadmap Status

This file tracks the current delivery state of the product.
It is not a release banner and it must not duplicate version truth.

Current runtime version: `v0.15.3`
Source of truth: [package.json](/Users/Shared/Projects/checklist/package.json) and [src/lib/release.ts](/Users/Shared/Projects/checklist/src/lib/release.ts)

## Delivered

### Product System
- Mantine is the only approved product UI framework.
- The multi-theme foundation is active through shared scheme-aware semantic tokens.
- Shared cards, shared modals, and shared typography are the required UI contract.

### Intelligence Quality
- Technical metadata is stripped at render and persistence boundaries.
- Card freshness badges are shared, centralized, and active across first-class entity cards.
- Card permalinks use canonical UUID routes and support standalone card pages.

### Scoring And Maintenance
- One canonical `1-10` scoring contract exists across upstream cards, knowledge, goals, and tasks.
- Periodic rescoring and maintenance operate oldest-first.
- Score-health detection classifies dominant score and tuple concentration into `HEALTHY`, `WARNING`, `SUSPICIOUS`, and `CRITICAL`.
- Planning drag-and-drop feeds human teaching signals back into task ICE scoring.

### Worker Queue
- Repetitive local-AI jobs are persisted as `PipelineJob` records.
- The webapp `Worker Queue` is the primary HiTL steering surface for repetitive jobs.
- Queue scheduling supports `AI_ONLY` and `HUMAN_GUIDED` control modes.
- Suspicious and critical score-health states can enqueue repair-oriented worker jobs.

## Active Priorities

1. Improve task and knowledge score discrimination so repeated tuples and repeated exact ICE values keep falling.
2. Keep burning down remaining hardcoded styling from the audit, starting with the tactical board and shared high-traffic surfaces.
3. Expand browser-level regression coverage for drag/drop, card sharing, theme behavior, and queue interactions.
4. Continue strengthening the local worker queue so more background jobs move into the canonical queue contract.

## Future Pipeline

- API and webhook ingestion for direct external source intake
- CRM and external integration harvesting
- Stronger recursive deliberation for high-stakes judging
- Better queue intelligence and operator ergonomics for local AI control

Last updated: `2026-05-09`

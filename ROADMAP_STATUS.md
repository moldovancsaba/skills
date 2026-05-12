# CHECKLIST Roadmap Status

This file tracks the current delivery state of the product.
It is not a release banner and it must not duplicate version truth.

Current runtime version: `v0.15.4`
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
- Internal score math now preserves decimal precision in `scoreProfile` and score-health tuple auditing even when visible compatibility fields round.
- Score provenance is live: agent proposal, calibrated factor traces, and final blended score are persisted together.
- Score calibration is history-aware across accepted, declined, modified, and delivered outcomes.
- Task ease is modeled from delivery difficulty rather than text complexity alone.
- Historical flashcards and taskcards have been backfilled onto the live scoring contract through the bounded repair path.
- Periodic rescoring and maintenance operate oldest-first.
- Score-health detection classifies dominant score and tuple concentration into `HEALTHY`, `WARNING`, `SUSPICIOUS`, and `CRITICAL`.
- Planning drag-and-drop feeds human teaching signals back into task ICE scoring.
- Source-backed Knowmore cards now retain durable citation snapshots and explicit conflict state.
- Maintenance now revisits oldest unresolved modified candidates and declined high-potential candidates.

### Worker Queue
- Repetitive local-AI jobs are persisted as `PipelineJob` records.
- The webapp `Worker Queue` is the primary HiTL steering surface for repetitive jobs.
- Queue scheduling supports `AI_ONLY` and `HUMAN_GUIDED` control modes.
- Suspicious and critical score-health states can enqueue repair-oriented worker jobs.

## Active Priorities

1. Keep burning down remaining hardcoded styling from the audit, starting with the tactical board and shared high-traffic surfaces.
2. Expand browser-level regression coverage for drag/drop, card sharing, theme behavior, and queue interactions.
3. Continue strengthening the local worker queue so more background jobs move into the canonical queue contract.
4. Harden answer trust with better conflict surfacing, evidence drill-down, and answer-to-action routing.

## Future Pipeline

- API and webhook ingestion for direct external source intake
- CRM and external integration harvesting
- Stronger recursive deliberation for high-stakes judging
- Better queue intelligence and operator ergonomics for local AI control

Last updated: `2026-05-13`

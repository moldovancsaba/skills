# CHECKLIST Handover

This handover is for future engineers and agents.
It is operational memory, not marketing.
It is part of the repository AI brain.

Read first:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [DESIGN_SYSTEM.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM.md)

## Current Contract

- Mantine is the only approved product UI framework
- Mantine `Card` is the base card primitive
- `UnifiedCard` is the only approved feature-level product card API
- `UnifiedCardModal` is the only approved modal content shell for card content
- first-class entity cards must expose canonical ICE visibly through the shared card header contract
- typography is centrally defined in the theme and DS typography primitives only
- interactions are centralized in the shared UI layer
- semantic tones are the only approved product color vocabulary
- ICE management is centralized through shared scoring contracts plus oldest-first maintenance and queue flows across upstream cards, knowledge, goals, and tasks
- tactical prioritization now uses the shared blended priority profile from `scoring-contract.js`; ICE remains visible, but placement also explains quality, urgency, freshness, human signal, risk, lifecycle state, and memory inputs
- repetitive local-AI work is represented as persisted `PipelineJob` queue records
- the webapp `Worker Queue` is the primary HiTL steering surface for repetitive jobs
- worker scheduling supports explicit `AI_ONLY` and `HUMAN_GUIDED` modes
- the shipped webapp tweak surface is the `Worker Queue` board, not a separate compact menu
- current human controls are drag/drop between queue columns, drag/drop reordering, and `Reset to AI Only`
- source-backed Knowmore cards now carry durable citation snapshots plus explicit conflict flags and summaries
- maintenance now includes oldest-first revisit jobs for unresolved modified candidates and declined high-potential candidates
- the webapp now exposes `Search & Answers`, `Observability`, and `Workflows` as first implementation slices for the next ideabank wave
- `Search & Answers` now supports entity filters, result counts, and grounded-answer confidence/evidence grouping
- first-class entity search results now open the canonical shared `/card/[uuid]` detail route rather than only module landing pages
- grounded answers now respect the active search entity-filter scope and expose that applied scope back to the operator
- grounded answers now visibly render their cited evidence cards inside the answer panel, not just summary text and counts
- grounded answers now render the named allowed scope layers in the answer panel so operators can verify the synthesis boundary at a glance
- Search & Answers now requires at least one explicitly selected layer and no longer silently falls back to all layers when the selection is empty
- `Observability` now supports bounded queue repair actions and AI workload budget controls directly from the webapp mission-control surface
- workflow blueprints and enrichment waterfall policies are persisted system contracts, not local page-only state
- active workflow blueprints now become first-class `PipelineJob` records that the worker can claim and execute
- enrichment waterfall policy now influences runtime URL-intelligence provider selection for product and competitor research paths
- the webapp now exposes `Evaluation Bench` as the first advisory promotion-gate surface for recommendation, grounded-answer, search, KPI, workflow, competitor, and data-readiness behavior
- evaluation runs use synthetic fixtures by default and only write to Observability when an operator explicitly publishes failed gates
- the webapp now exposes `Content Generation` for producing email subject lines, ad copy, social posts, and landing-page copy from existing company, product, goal, topic, and competitor context
- content generation persists outputs as `CreativeDraft` records and records generation/audit events without automated posting
- AI workload governance now persists `AiWorkloadUsage`, `BudgetPolicy`, and `BudgetEvent` records so queue, evaluation, content-generation, and observability work can be attributed by company and feature
- budget controls are operator-applied and reviewable: queue throttling, evaluation batching, and cache/reuse policy changes do not silently suppress critical evidence work
- the webapp now exposes `Athlete App` beside the coach/operator surfaces so athletes can see coach-assigned checklist work, record daily activity, wellness/body metrics, and mark assigned work complete
- the webapp also exposes `Athletes` as the coach-facing records view for team daily logs, completion evidence, readiness, load, sleep, soreness, and pain flags
- athlete records persist as `AthleteActivityLog` entries keyed by company, athlete email, day, and optional assigned task

## Files That Matter Most

Frontend:

- [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- [src/app/globals.css](/Users/Shared/Projects/checklist/src/app/globals.css)
- [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts)
- [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- [src/app/[companyId]/pipeline/page.tsx](/Users/Shared/Projects/checklist/src/app/[companyId]/pipeline/page.tsx)
- [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)

System:

- [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
- [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
- [src/lib/pipeline-queue.js](/Users/Shared/Projects/checklist/src/lib/pipeline-queue.js)
- [scripts/lib/pipeline-jobs.js](/Users/Shared/Projects/checklist/scripts/lib/pipeline-jobs.js)
- [src/lib/evaluation-bench.ts](/Users/Shared/Projects/checklist/src/lib/evaluation-bench.ts)
- [src/lib/content-generation.ts](/Users/Shared/Projects/checklist/src/lib/content-generation.ts)
- [src/lib/athlete-activity.ts](/Users/Shared/Projects/checklist/src/lib/athlete-activity.ts)

## Do Not Reintroduce

- raw feature-level `Paper` surfaces
- raw feature-level `Card` surfaces for product-owned cards
- legacy color aliases like `blue`, `brand`, `orange`, `green`, `purple`, `teal`
- ad hoc text sizing and custom title scales in feature code
- local transition or hover systems for product surfaces
- alternative card shells
- “one-off” visual exceptions without updating the rulebook and audit

## Mandatory Update Rule

If you change any of these:

- stack
- theme
- card primitives
- modal shell rules
- typography primitives
- semantic tones
- state semantics
- interaction primitives
- AI pipeline stages
- scoring rules
- worker queue contract
- scheduling mode contract

Then you must update in the same work:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. the directly affected contract doc
3. this handover

## Done Means

The work is not done until:

- code is updated
- docs are updated
- `npm run lint` passes
- `npm run audit:docs` passes
- `npm run audit:semantic` passes
- `npx tsc --noEmit` passes

## Pipeline Queue Notes

- The worker now consumes persisted queue jobs before the broader synthesis cycle.
- Human drag-and-drop on the `Worker Queue` board switches jobs into `HUMAN_GUIDED` mode.
- `Reset to AI only` clears manual queue influence and returns scheduling to autonomous control.
- Score-health alert repair is now able to escalate queue work through the shared queue contract.
- Frontier recompute assigns tactical columns by blended priority thresholds, not raw ICE alone, while preserving manual human drag/drop anchors.
- Evaluation bench replay is advisory first: synthetic fixtures and rubric gates compare baseline vs candidate behavior without production writes unless failed gates are explicitly published to Observability.
- Content generation is draft-only: it can create and persist channel-specific copy, but it must not post externally or generate images in the first release.
- Budget governor is observability-first: usage/cost values are estimates unless explicitly marked actual, and controls are recorded as events/policies rather than hidden scheduling overrides.
- Athlete app is athlete-facing: it records daily activity, wellness/body metrics, and completion evidence but does not replace the coach/operator planning surfaces.
- Athlete records is coach-facing: it can summarize team submissions, but planning and assignment still stay in the coach/operator checklist surfaces.

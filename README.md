# CHECKLIST

CHECKLIST is a multi-tenant autonomous intelligence system built on a strict Mantine-only product UI and a recurrent AI pipeline.

This repository has one non-negotiable rule:

- if the system contract changes, the documentation contract must change in the same work

## Documentation Hierarchy

Read these in order. Lower documents must not contradict higher ones.

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [DESIGN_SYSTEM.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM.md)
5. [docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md](/Users/Shared/Projects/checklist/docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md)
6. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)
7. [DESIGN_SYSTEM_AGENT_HANDOFF.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM_AGENT_HANDOFF.md)
8. [documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md](/Users/Shared/Projects/checklist/documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md)

If two docs disagree:

- `docs/RULEBOOK.md` wins
- then `docs/SSOT.md`
- then implementation in the designated source-of-truth files listed below

## Approved Stack

Application stack:

- Next.js 16 App Router
- React 18
- Mantine 7
- Tabler Icons
- Prisma
- MongoDB Atlas
- Ollama for local model execution

Frontend system:

- Mantine is the only approved UI framework
- Mantine `Card` is the only approved base for product card surfaces
- `UnifiedCard` is the only approved product card API for feature code
- `UnifiedCardModal` is the only approved modal content shell for product cards
- first-class entity card surfaces must expose their canonical ICE score through the shared card header contract
- Typography is defined centrally in the Mantine theme and DS typography primitives only
- ICE management must run through the canonical scoring contract and the oldest-first maintenance queue across upstream cards, knowledge, goals, and tasks
- tactical placement uses the shared blended priority contract: ICE remains visible, while ranking also accounts for quality, urgency, freshness, human signal, risk, lifecycle state, and memory signal
- source-backed Knowmore cards must persist durable citation snapshots and explicit conflict state instead of relying on raw URLs alone

Worker queue controls:

- the webapp implementation is a `Worker Queue` board at `/:companyId/pipeline`
- the shipped human controls are:
  - drag and drop jobs between `Now`, `Soon`, `Later`, and `Parked`
  - drag and drop reordering inside a column
  - one-step `Reset to AI Only`
- drag and drop switches affected jobs into `HUMAN_GUIDED`
- `Reset to AI Only` clears manual queue influence and returns scheduling to shared AI logic
- there is not a separate compact tweak dropdown/menu yet; the board itself is the shipped tweak surface

New operator surfaces:

- `/:companyId/search` provides unified internal retrieval plus grounded answers over company context
- Search now supports entity-layer filters, ranked counts, and grounded-answer confidence/evidence-group framing
- first-class entity search results now deep-link into the canonical shared `/card/[uuid]` card route instead of dropping operators onto module-level index pages
- `/:companyId/observability` provides mission-control visibility into worker health, queue pressure, score health, AI workload budget pressure, and recent outcomes
- Observability now exposes bounded repair and budget actions for queue sync, score-repair escalation, failed-job recovery, queue throttling, evaluation batching, and cache/reuse controls
- `/:companyId/workflows` provides bounded workflow blueprints and enrichment-waterfall policy management
- active workflow blueprints are not passive records: they materialize into claimable `WORKFLOW_BLUEPRINT` queue jobs and execute through the shared worker queue
- enrichment-waterfall policies now affect runtime provider selection for URL intelligence instead of living as config-only records
- `/:companyId/evaluations` provides an advisory evaluation bench for recommendation, grounded-answer, search, KPI, workflow, competitor, and data-readiness behavior before intelligence changes are promoted
- `/:companyId/content-generation` generates and saves evidence-aware email subjects, platform ad copy, social posts, and landing-page sections from product and competitor context
- `/:companyId/voc` records customer-language signals and fuses them into evidence-backed themes, root-cause hypotheses, and action briefs
- `/:companyId/athlete` provides an athlete-facing daily app for coach-assigned work, activity recording, wellness/body metrics, readiness notes, and completion records
- `/:companyId/athletes` provides a coach-facing athlete records view for daily team logs, completion evidence, load, sleep, soreness, readiness, and pain flags

Knowmore evidence durability:

- citation snapshots persist normalized URL, excerpt, fetch timing, and content hash for source-backed knowledge
- conflicting source evidence lowers knowledge confidence and forces explicit review state instead of silent merge certainty
- oldest-first maintenance backfills missing citation snapshots and revisits unresolved/declined high-potential task candidates

## Frontend Sources Of Truth

These files define the live UI contract:

- [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- [src/app/globals.css](/Users/Shared/Projects/checklist/src/app/globals.css)
- [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts)
- [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)

## Non-Negotiable Product UI Rules

- No Tailwind utilities for product UI
- No shadcn fragments for product UI
- No raw `Paper` or raw feature-level `Card` surfaces
- No direct visual `style` overrides on `UnifiedCard` family components
- No legacy color aliases like `blue`, `brand`, `orange`, `green`, `purple`, `teal`, `cyan`, `amber`
- No local typography overrides for `fontSize`, `letterSpacing`, or ad hoc title scales in feature code
- No local hover systems or local transition systems for product surfaces

## Required Commands

Before closing UI or architecture work:

```bash
npm run audit:docs
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

## Mandatory Documentation Update Rule

Update documentation in the same change whenever you modify:

- stack choices
- design system rules
- semantic tone vocabulary
- card APIs
- typography primitives
- interaction primitives
- AI pipeline stages
- scoring rules
- system state models
- handover instructions for future agents

At minimum, update:

- [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
- [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

And update any deeper contract docs affected by the change.

## CI Enforcement

Repository guards run in:

- [/.github/workflows/repo-guards.yml](/Users/Shared/Projects/checklist/.github/workflows/repo-guards.yml)

That workflow enforces:

- `npm run audit:docs`
- `npm run audit:semantic`
- `npm run lint`
- `npx tsc --noEmit`

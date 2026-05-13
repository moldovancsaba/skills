# CHECKLIST

CHECKLIST is a multi-tenant autonomous intelligence system built on a strict Mantine-only product UI and a recurrent AI pipeline.

## Product Boundary

CHECKLIST is a general-purpose company decision-maker, task manager, and AI support system.

Checklist-core includes:

- evidence ingestion and enrichment
- knowledge synthesis
- grounded answers and search
- goals, planning, checklist work, and review
- worker queue steering
- observability and bounded workflows

Checklist-core does not include first-class vertical products such as:

- athlete or coach apps
- marketing content studios
- campaign execution suites
- SEO workbenches
- lead-scoring CRMs
- email-sequencing tools
- objection-handling playbooks as standalone product surfaces

Allowed internal governance exception:

- `Evaluation Bench` may exist as an admin-only internal quality-governance surface for replay, regression, and promotion gating
- it is not a normal end-user checklist module and should stay outside the main navigation

Those ideas may exist as research or future opportunities, but they belong in `IDEABANK` or in a dedicated external project board until they are explicitly reframed into the general CHECKLIST decision-support contract.

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
- score generation must persist score provenance: agent proposal, calibrated heuristic score, and final blended score profile
- score calibration must consume company-specific history from accepted, declined, modified, and delivered cards when deriving new-card impact and confidence
- task `ease` must be calibrated as delivery difficulty converted into an ease signal, using dependencies, coordination burden, expertise requirement, time-to-value, and delivery history
- the scoring overhaul track is now closed: the live contract is factorized, history-aware, delivery-difficulty-aware, precision-preserving, and maintained through bounded repair/backfill plus score-health observability
- tactical placement uses the shared blended priority contract: ICE remains visible, while ranking also accounts for quality, urgency, freshness, human signal, risk, lifecycle state, and memory signal
- tactical columns are assigned by relative peer ranking plus human anchors, not by raw fixed ICE thresholds alone
- residual score-health warnings are now treated as monitored maintenance signals, not as an open architecture program
- source-backed Knowmore cards must persist durable citation snapshots and explicit conflict state instead of relying on raw URLs alone
- Knowmore now supports direct operator correction controls for pinning, hiding, marking wrong, requesting refresh, and suppressing bad source influence
- Knowmore now exposes a dedicated health and repair surface for bounded sync, repair, and failed-job recovery actions
- task feedback now feeds the canonical Trinity feedback stream directly, including `DELIVER` as a stronger executed-in-reality signal
- task and knowledge cards now persist lineage fields for version family, duplicate cluster, generated origins, and refined origins
- the active self-learning path is Apple-Silicon-first: checklist exports local training datasets, fine-tunes through MLX / MLX-LM, and deploys candidate models back through Ollama after evaluation gates
- Unsloth, LLaMA-Factory, and Axolotl are parked research only and are not part of the active delivery plan

Worker queue controls:

- the webapp implementation is a `Worker Queue` board at `/:companyId/pipeline`
- the shipped human controls are:
  - drag and drop jobs between `Now`, `Soon`, `Later`, and `Parked`
  - drag and drop reordering inside a column
  - one-step `Reset to AI Only`
- drag and drop switches affected jobs into `HUMAN_GUIDED`
- `Reset to AI Only` clears manual queue influence and returns scheduling to shared AI logic
- there is not a separate compact tweak dropdown/menu yet; the board itself is the shipped tweak surface

Backlog execution rule:

- autonomous implementation and normal engineering work may pull from active delivery columns only
- `IDEABANK` is research storage, not an execution source
- ideabank or vertical-experiment items must not be surfaced in the main checklist navigation or core product docs unless they are explicitly promoted out of ideabank

New operator surfaces:

- `/:companyId/search` provides unified internal retrieval plus grounded answers over company context
- Search now supports entity-layer filters, ranked counts, and grounded-answer confidence/evidence-group framing
- first-class entity search results now deep-link into the canonical shared `/card/[uuid]` card route instead of dropping operators onto module-level index pages
- grounded answers now obey the active entity-layer filter scope instead of synthesizing from hidden layers outside the operator-selected search boundary
- grounded answers now visibly render their cited evidence cards inside the answer surface so operators can inspect the supporting cards without leaving the search workflow blind
- grounded answers now also show the named allowed scope layers directly in the answer panel, not just a numeric layer count
- Search & Answers no longer silently widens to all layers when the operator deselects every layer; it now requires at least one explicit search layer before running
- Search & Answers now clears stale ranked results and grounded answers immediately when the operator changes the selected layers, so visible output always matches the active scope
- `/:companyId/observability` provides mission-control visibility into worker health, queue pressure, score health, AI workload budget pressure, and recent outcomes
- Observability now exposes bounded repair and budget actions for queue sync, score-repair escalation, failed-job recovery, queue throttling, evaluation batching, and cache/reuse controls
- Knowmore now also exposes bounded health/repair actions directly on the knowledge surface instead of forcing operators through generic observability only
- `/:companyId/workflows` provides bounded workflow blueprints and enrichment-waterfall policy management
- active workflow blueprints are not passive records: they materialize into claimable `WORKFLOW_BLUEPRINT` queue jobs and execute through the shared worker queue
- enrichment-waterfall policies now affect runtime provider selection for URL intelligence instead of living as config-only records

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

## Local Self-Learning

The active local self-learning contract is documented in:

- [docs/LOCAL_SELF_LEARNING_SYSTEM.md](/Users/Shared/Projects/checklist/docs/LOCAL_SELF_LEARNING_SYSTEM.md)

Current delivery path:

1. export operator-teaching datasets from the live database
2. fine-tune locally on Apple Silicon with MLX / MLX-LM
3. evaluate the candidate against checklist regression cases
4. canary and promote through Ollama only after the candidate clears the gate

The internal admin-only `/:companyId/evaluations` surface now shows both:

- the seeded synthetic evaluation bench
- local MLX candidate run manifests and gate outcomes from `training/runs/`
- and a `Publish Gate` action that writes completed local run outcomes into the normal observability/history ledger

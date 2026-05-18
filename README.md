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

Documentation scope rule:

- documents explicitly listed in the hierarchy below are active contract documents
- historical audits, postmortems, migration notes, and dated research papers under `docs/` are not current runtime truth unless an active contract document explicitly incorporates them

Professional operating rule:

- do not hallucinate repository facts or rules
- do not soften explicit standards
- do not use vague filler wording in place of precise status

## Documentation Hierarchy

Read these in order. Lower documents must not contradict higher ones.

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [docs/LOCAL_AI_PLANNER_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PLANNER_LLD.md)
5. [docs/LOCAL_AI_QUALITY_ENGINE_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_QUALITY_ENGINE_LLD.md)
6. [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)
7. [CHANGELOG.md](/Users/Shared/Projects/checklist/CHANGELOG.md)
8. [DESIGN_SYSTEM.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM.md)
9. [docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md](/Users/Shared/Projects/checklist/docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md)
10. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)
11. [DESIGN_SYSTEM_AGENT_HANDOFF.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM_AGENT_HANDOFF.md)
12. [documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md](/Users/Shared/Projects/checklist/documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md)

If two docs disagree:

- `docs/RULEBOOK.md` wins
- then `docs/SSOT.md`
- then implementation in the designated source-of-truth files listed below

If a dated audit or retrospective disagrees with active contract docs or live code:

- treat the dated audit as historical evidence
- treat the active hierarchy plus live implementation as current truth

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
- the app shell now includes a real persisted UI language selector for `English`, `Hungarian`, `Spanish`, `Arabic`, and `Hebrew`
- UI language is a browser-local interface preference and is distinct from the company `allowedLanguages` policy used for local AI output governance
- Mantine `Card` is the only approved base for product card surfaces
- `UnifiedCard` is the only approved product card API for feature code
- `UnifiedCardModal` is the only approved modal content shell for product cards
- DS-owned `Text` and `Title` wrappers in `src/components/ui/typography.tsx` are the only approved general-purpose typography bridge for feature code
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
- Knowmore now exposes a dedicated health and repair surface for persisted health visibility plus repair-intent capture; the local AI system executes the actual sync, repair, and failed-job recovery work
- task feedback now feeds the canonical Trinity feedback stream directly, including `DELIVER` as a stronger executed-in-reality signal
- task and knowledge cards now persist lineage fields for version family, duplicate cluster, generated origins, and refined origins
- the active self-learning path is Apple-Silicon-first: checklist exports local training datasets, fine-tunes through MLX / MLX-LM, and deploys candidate models back through Ollama after evaluation gates
- the governed self-learning rollout path is now: export -> regression gate -> register -> canary -> promote or rollback
- Unsloth, LLaMA-Factory, and Axolotl are parked research only and are not part of the active delivery plan
- the deterministic local AI planner is now the shipped runtime contract for bootstrap, lane refill, maintenance, and timeout handling
- the Local AI Quality Engine is now the shipped runtime contract for opportunity mining, research-backed updates, novelty suppression, editorial quality gating, and feedback-pressure regeneration
- the local AI runtime now uses a dedicated `snapshot-worker` background process so intelligence snapshot refresh no longer shares the foreground planner queue lane

Worker queue controls:

- the webapp implementation is an `AI Queue` board at `/:companyId/pipeline`
- queue claiming must not starve untouched jobs behind repeatedly retried jobs from the same company
- sparse companies are handled through explicit planner jobs for bootstrap and fallback work instead of relying on broad synthesis as the primary operating mode
- active quality work is also queue-owned through explicit jobs for opportunity mining and feedback-pressure regeneration
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
- `/local-ai` provides a public no-login local runtime mission-control view for the worker itself: current task, current company, global queue, and card totals
- Observability now captures bounded repair intents and budget-control records for queue sync, score-repair escalation, failed-job recovery, queue throttling, evaluation batching, and cache/reuse controls; the local AI system pulls those records from MongoDB Atlas and executes them
- Knowmore now also exposes bounded health/repair intent capture directly on the knowledge surface instead of forcing operators through generic observability only
- queue reads, feedback analytics, and hashtag recommendations are now persisted-state or snapshot-backed reads; loading a page must not trigger worker synchronization or app-layer recomputation
- `/:companyId/workflows` provides bounded workflow blueprints and enrichment-waterfall policy management
- active workflow blueprints are not passive records: they materialize into claimable `WORKFLOW_BLUEPRINT` queue jobs and execute through the shared worker queue
- enrichment-waterfall policies now affect runtime provider selection for URL intelligence instead of living as config-only records

Knowmore evidence durability:

- citation snapshots persist normalized URL, excerpt, fetch timing, and content hash for source-backed knowledge
- conflicting source evidence lowers knowledge confidence and forces explicit review state instead of silent merge certainty
- oldest-first maintenance backfills missing citation snapshots and revisits unresolved/declined high-potential task candidates
- oldest-first maintenance now performs real refresh work across flashcards, taskcards, datacards, and goalcards, including research-backed updates when policy requires it

## Release Status

Current shipped release:

- `v0.16.0`

## Open Source Quickstart

This is the shortest correct path for running the repository locally.

### Prerequisites

- Node.js `20+`
- npm
- MongoDB Atlas connection string in `DATABASE_URL`
- Ollama running locally or on a reachable host

Recommended local model baseline:

- `qwen2.5:7b`
- or a smaller fallback model configured through the existing worker/runtime settings

### Install

```bash
npm install
```

Prisma client generation runs automatically on install and prebuild.

### Configure

Required environment:

- `DATABASE_URL`

Optional but commonly used local AI environment:

- `OLLAMA_URL` or `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `FALLBACK_MODEL`
- `USE_SAFE_MODE`

### Run the web app

The Next.js app defaults to port `3000`, but you should use any free local port if `3000` is already occupied.

Examples:

```bash
npm run dev
```

or on a non-default port:

```bash
npm run dev -- --port 3415
```

### Run the local AI runtime

The recommended entrypoint is the guardian:

```bash
npm run guardian
```

That supervision path owns the local AI process group and keeps these runtime services alive:

- `sync`
- `snapshot-worker`
- `status-server`

Architecture note:

- `guardian` is the watchdog and supervisor
- `sync` is the only foreground mutating worker
- `snapshot-worker` owns background intelligence snapshot refresh
- `status-server` owns runtime observability payload assembly

### Local operator URLs

If you run the web app on port `3415`, the public no-login operator surface is:

- `http://localhost:3415/local-ai`

Raw local AI endpoints:

- worker health: `http://127.0.0.1:10005/health`
- status server: `http://127.0.0.1:10006/api/status`
- snapshot-worker health: `http://127.0.0.1:10007/health`

Important:

- `/local-ai` is the public mission-control page for the local AI runtime
- it is not company-scoped
- it is not login-gated
- bare `/` rewrites to `/local-ai` when there is no session

Related architecture references:

- [docs/SSOT.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/SSOT.md)
- [docs/SYSTEM_DESIGN_LLD.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/SYSTEM_DESIGN_LLD.md)
- [docs/LOCAL_AI_PIPELINE.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/LOCAL_AI_PIPELINE.md)
- [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)

### Verify the repo before working

```bash
npm run audit:docs
npm run audit:semantic
npm run lint
npx tsc --noEmit
```

Release artifacts:

- [CHANGELOG.md](/Users/Shared/Projects/checklist/CHANGELOG.md)
- [docs/LOCAL_AI_PLANNER_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PLANNER_LLD.md)
- [docs/LOCAL_AI_QUALITY_ENGINE_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_QUALITY_ENGINE_LLD.md)

24/7 runtime hardening design:

- [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)

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
- No raw feature-level DOM wrappers such as `div` or `span` when approved Mantine/DS primitives exist
- No feature-level `className` hooks
- No raw `Text` or `Title` imports from `@mantine/core` in feature code
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

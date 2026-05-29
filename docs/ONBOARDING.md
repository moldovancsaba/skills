# CHECKLIST Onboarding

Start here only after reading:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md)
3. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
4. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

If you skip those, you do not have the current system contract.

## What The System Is

CHECKLIST is a multi-tenant autonomous intelligence system with:

- a recurrent AI processing loop
- a card-based product model
- a rigid Mantine-only frontend
- a strict local-AI authority boundary

## Authority Boundary

This rule is not optional:

- the online webapp reads persisted results from MongoDB Atlas
- the online webapp writes only webapp-required product mutations, repair intents, and operator commands back to MongoDB Atlas
- the online webapp must not calculate authoritative queue state, score health, observability health, ranking, or repair outcomes
- the local AI system owns the heavy audit/event ledger in a local MongoDB database through `LOCAL_DATABASE_URL`
- the local AI system pulls the needed records, performs the calculations, and pushes the updated product state back into MongoDB Atlas

If you see authoritative calculation logic in the webapp layer, treat it as architecture debt and remove it.

## Future Function Rule

New mini-app functions must follow [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md).

That means:

- local AI prepares, webapp reads
- hot routes are projection-first
- server bootstrap beats post-mount waterfalls
- payloads must be explicit and minimal
- non-critical hydration should be deferred

## What The Frontend Uses

- Mantine only
- Mantine theme only
- `UnifiedCard` for feature-level product cards
- centralized typography primitives
- centralized interaction helpers

## What New Contributors Must Not Assume

- old docs are not automatically valid
- ad hoc card patterns are not allowed
- raw `Paper` surfaces are not allowed for product cards
- local type scales are not allowed
- changing the system without updating the AI brain docs is not allowed
- the webapp is not allowed to “help out” by recomputing AI state
- there is no permission to soften written rules in code, docs, or communication
- the old “synthetic ICE overhaul” is not an open project anymore; the live scoring contract is already factorized, history-aware, delivery-difficulty-aware, and precision-preserving
- the active self-learning training path is Apple-Silicon-native through MLX / MLX-LM and Ollama; do not assume GPU-first frameworks like Unsloth are part of the active rollout

## Required First Commands

```bash
npm run audit:docs
npm run audit:semantic
npm run lint
npx tsc --noEmit
```

## Installation And Local Startup

### Prerequisites

- Node.js `20+`
- npm
- MongoDB Atlas connection string in `DATABASE_URL`
- local MongoDB connection string in `LOCAL_DATABASE_URL`
- local or reachable Ollama runtime

### Install dependencies

```bash
npm install
```

Start the local audit database:

```bash
npm run local-audit-db:start
```

### Required environment

- `DATABASE_URL`
- `LOCAL_DATABASE_URL`

Common optional runtime variables:

- `OLLAMA_URL` or `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `FALLBACK_MODEL`
- `USE_SAFE_MODE`

### Start the web app

Default:

```bash
npm run dev
```

If `3000` is already in use, run the app on an explicit free port instead:

```bash
npm run dev -- --port 3415
```

### Start the local AI runtime

Recommended:

```bash
npm run guardian
```

The guardian supervises:

- `sync`
- `snapshot-worker`
- `status-server`

## Canonical Local URLs

- production: `https://checklist.sovereignsquad.com`
- local development default: `http://localhost:3000`
- local development on an alternate port example: `http://localhost:3415`
- local-only local AI operator dashboard: `http://localhost:3415/local-ai`
- raw worker health: `http://127.0.0.1:10005/health`
- raw status payload: `http://127.0.0.1:10006/api/status`
- raw snapshot-worker health: `http://127.0.0.1:10007/health`

Important:

- `/local-ai` is local-only and not login-gated on localhost
- it is a global local-AI mission-control surface, not a company page
- when there is no app session, bare `/` rewrites to `/local-ai` only on localhost-style operator hosts

## Core Product Routes

- `/`
- `/[companyId]`
- `/[companyId]/data`
- `/[companyId]/topics`
- `/[companyId]/knowmore`
- `/[companyId]/goals`
- `/[companyId]/review`
- `/[companyId]/tactical`
- `/[companyId]/pipeline`
- `/[companyId]/settings`
- `/manual`
- `/faq`

## Operator Support Surface

New contributors must know where support content actually lives:

- `/manual` is the operator manual and onboarding surface
- `/faq` is the troubleshooting and support-answer surface
- both must stay accurate about the webapp/local-AI boundary, language policy, markdown-file behavior, and repair workflow
- if product behavior changes, update these support surfaces in the same work

## AI Brain Update Rule

If you change:

- stack
- architecture
- design system
- prompts
- lifecycle rules
- scoring rules

Then you must update the governing docs in the same work.

## Scoring Onboarding

- `src/lib/scoring-contract.js` is the only place allowed to own canonical ICE and priority math
- visible `iceScore` is not the only ranking signal; task placement comes from `priorityProfile`
- `scoreProfile` is part of the live data contract and must preserve agent proposal, calibrated factors, and final blended score
- historical rescoring must run through `scripts/repair-ice-scores.js`, not one-off local scripts
- score-health warnings are maintenance inputs; do not “fix” them by adding local ranking shortcuts in feature code

## Self-Learning Onboarding

- `scripts/export-learning-datasets.mjs` is the canonical dataset-export entrypoint
- `training/` is the local workspace for active self-learning rollout files
- MLX / MLX-LM is the active training path because checklist runs on Apple Silicon only
- Unsloth, LLaMA-Factory, and Axolotl are parked research only and should not be treated as current delivery dependencies

# CHECKLIST Onboarding

Start here only after reading:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

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
- the online webapp writes user interactions, repair intents, and operator commands back to MongoDB Atlas
- the online webapp must not calculate authoritative queue state, score health, observability health, ranking, or repair outcomes
- the local AI system pulls those persisted records, performs the calculations, and pushes the updated results back into MongoDB Atlas

If you see authoritative calculation logic in the webapp layer, treat it as architecture debt and remove it.

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

## Canonical Environments

- production: `https://checklist.checklistsquad.com`
- local development: `http://localhost:3000`

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

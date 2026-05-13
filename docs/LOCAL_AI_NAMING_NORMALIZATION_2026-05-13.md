# Local AI Naming Normalization

Date:
- `2026-05-13`

Status:
- `Delivered`

Version:
- `0.15.5`

## Why this cleanup happened

The shipped product and runtime had already moved away from the old `trinity` and `checklistSync` naming, but several internal identifiers were still carrying those legacy names.

That created avoidable confusion in three places:

- workflow debugging
- operator observability
- implementation work on the local AI scheduler and revisit loops

## What was normalized

The live local AI code now uses neutral naming for active runtime concepts.

Examples:

- `trinity_DRAFT_TIMEOUT_MS` → `DRAFT_STAGE_TIMEOUT_MS`
- `trinity_WRITE_TIMEOUT_MS` → `WRITE_STAGE_TIMEOUT_MS`
- `trinity_JUDGE_TIMEOUT_MS` → `JUDGE_STAGE_TIMEOUT_MS`
- `runtrinityPass` → `runLocalAiPass`
- `trinity-worker:${pid}` → `local-ai-worker:${pid}`
- `trinity-refiner` → `local-ai-refiner`

Comments and prompts in the active local AI modules were also updated so they refer to:

- `local AI pipeline`
- `local AI engine`
- `checklist Refiner`
- `checklist Evaluator`

## What was intentionally preserved

Not every historical reference was deleted.

Historical documents can still describe older runtime behavior when they are explicitly marked as historical. Those records remain useful for understanding migration history, but they are no longer the active contract.

## Affected live modules

- [scripts/lib/core.js](/Users/Shared/Projects/checklist/scripts/lib/core.js)
- [scripts/lib/ai.js](/Users/Shared/Projects/checklist/scripts/lib/ai.js)
- [scripts/lib/drafter.js](/Users/Shared/Projects/checklist/scripts/lib/drafter.js)
- [scripts/lib/writer.js](/Users/Shared/Projects/checklist/scripts/lib/writer.js)
- [scripts/lib/refiner.js](/Users/Shared/Projects/checklist/scripts/lib/refiner.js)
- [scripts/lib/evaluator.js](/Users/Shared/Projects/checklist/scripts/lib/evaluator.js)
- [scripts/lib/synthesis.js](/Users/Shared/Projects/checklist/scripts/lib/synthesis.js)
- [scripts/seed-settings.js](/Users/Shared/Projects/checklist/scripts/seed-settings.js)

## Result

The active local AI workflow now has one naming vocabulary across:

- worker runtime
- queue execution
- revisit/refine stages
- observability
- documentation

This makes future workflow fixes easier because the code no longer mixes historical engine names with the current queue-owned local AI architecture.

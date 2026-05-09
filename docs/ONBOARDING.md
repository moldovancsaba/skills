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
- `/[companyId]/settings`

## AI Brain Update Rule

If you change:

- stack
- architecture
- design system
- prompts
- lifecycle rules
- scoring rules

Then you must update the governing docs in the same work.

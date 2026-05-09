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

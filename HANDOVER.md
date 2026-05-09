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
- typography is centrally defined in the theme and DS typography primitives only
- interactions are centralized in the shared UI layer
- semantic tones are the only approved product color vocabulary

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
- [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)

System:

- [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
- [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)

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

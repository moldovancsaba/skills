# CHECKLIST Design System

This document defines the live product design system.
It is subordinate to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md) and must not conflict with it.

## System Summary

The CHECKLIST UI is:

- Mantine only
- semantic-tone driven
- Mantine-theme controlled
- centralized around one card API
- centrally typed for typography
- centrally controlled for interactions
- centrally controlled for layout grammar

## Canonical Product UI Stack

- Mantine theme in [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- global tokens in [src/app/globals.css](/Users/Shared/Projects/checklist/src/app/globals.css)
- semantic surface helpers in [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- state semantics in [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts)
- interaction helpers in [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- typography primitives in [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- card shell in [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- modal shell in [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- page/layout primitives in [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)

## Core Non-Negotiable Rules

1. Mantine is the only approved UI framework.
2. Mantine `Card` is the only approved base primitive for product card surfaces.
3. `UnifiedCard` is the only approved feature-level card API.
4. `UnifiedCardModal` is the only approved modal content shell for card-driven surfaces.
5. Semantic tones are the only approved product color vocabulary.
6. Typography is centrally defined only.
7. Interaction behavior is centralized only.
8. Shared UI rules are enforced in code and by audit, not by convention alone.
9. Card detail mode must fully expose persisted card-type-specific fields inside the shared card grammar; the modal shell is centralized, but detail content cannot omit known typed fields for that entity family.

## Semantic Tones

Allowed tones:

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

Feature code must not use legacy hue aliases as product semantics.

## Surface Architecture

Approved hierarchy:

- Mantine `Card`
- `UnifiedCard`
- `UnifiedCardBody`
- `UnifiedCardSection`
- `UnifiedCardActions`
- `UnifiedCardFooter`

Shared helper layer:

- `getSemanticSurfaceStyle(tone, { elevated })`
- `getSemanticHoverStyle(tone)`
- `getSemanticInsetStyle(tone)`
- `getSemanticCalloutStyle(tone)`
- `getSidebarActiveStyle(tone)`
- `getSidebarHoverStyle(tone)`

Rules:

- feature code uses `UnifiedCard` for product card surfaces
- inset sections use `UnifiedCardSection` or approved semantic helpers
- callouts use `getSemanticCalloutStyle(...)`
- feature code must not inject arbitrary visual styling into the `UnifiedCard` family
- raw `Paper` surfaces are not an approved product card path

## Typography Architecture

Typography sources of truth:

- Mantine theme sizing and heading scale in `providers.tsx`
- DS text primitives in `typography.tsx`

Approved primitives:

- `PageTitle`
- `SectionTitle`
- `CardTitle`
- `BodyText`
- `MetaText`
- `LabelText`
- `ActionLabel`

Rules:

- no feature-level `fontSize`
- no feature-level `letterSpacing`
- no ad hoc title hierarchy
- if a new text role is needed, add a DS primitive first
- decorative filler labels are forbidden
- sidebar labels, route-card labels, counts, and legal/meta text must collapse into the approved primitives instead of local `Text size=...` recipes

## Layout Grammar

Shared layout grammar lives in `src/components/ui/app-shell.tsx` and the shared shell/navigation primitives.

Rules:

- sidebar navigation and dashboard route cards must read as one hierarchy system
- first-level route cards must use one shared structure:
  - icon
  - count or metric
  - title
  - optional short description or optional chart
- decorative footer filler such as repeated “Access Layer” copy is forbidden
- route-card density and height must come from the shared card API, not page-local improvisation
- balanced route-card grids are required; accidental uneven wraps are design defects, not acceptable variance
- buttons and badges must not rely on ornamental all-caps styling to create hierarchy

## Interaction Architecture

Approved interaction source:

- `applySurfaceInteractionHandlers(...)`
- shared card/nav primitives

Rules:

- no local hover recipes for product surfaces
- no local transition declarations
- no Mantine `Transition` wrappers for product surfaces
- global no-motion rule remains authoritative

## Theme Defaults

Centrally defined in `providers.tsx`:

- `Inter` font family
- `md` default radius
- shared semantic color scales
- standardized `Button`, `Badge`, `Card`, `ThemeIcon`, `Text`, `Title`, `Input`, `Modal`, `Divider`

## Forbidden Patterns

- `color="brand"`
- `color="blue"`
- `color="green"`
- `color="orange"`
- `color="violet"`
- `color="cyan"`
- `color="teal"`
- `color="indigo"`
- raw `Paper` product surfaces
- feature-level raw `Card` product surfaces
- direct `style` visual overrides on `UnifiedCard` family components
- raw Mantine dark palette references for product styling
- local `rgba(...)` glass recipes
- local transitions
- custom local typography scales

## Enforcement

Required verification:

```bash
npm run audit:docs
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

If a new drift pattern is discovered:

1. fix code
2. update this document
3. update [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
4. harden [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)
5. update [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

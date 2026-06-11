# CHECKLIST Design System

This document defines the live product design system.
It is subordinate to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md) and must not conflict with it.

`/Users/Shared/Projects/general-design-system` is the current checked-out General Design System source of truth for design, UI, and UX, and the governed upstream repository is `sovereignsquad/general-design-system`. This file defines only the CHECKLIST local adapter layer, migration state, validation commands, and approved project-specific constraints.

GDS alignment:

- consumed GDS version/package: `@doneisbetter/gds@3.4.3`
- GDS package published: `2026-06-06T23:01:58.666Z`
- shared package install path: direct package consumption through `@doneisbetter/gds`, `@doneisbetter/gds-theme`, `@doneisbetter/gds-core`, and `@doneisbetter/gds-admin`

## System Summary

The CHECKLIST UI is:

- GDS only
- semantic-tone driven
- GDS-provider/theme controlled
- centralized around one card API
- centrally typed for typography
- centrally controlled for interactions
- centrally controlled for layout grammar

## Canonical Product UI Stack

- GDS provider/theme in [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- global tokens in [src/app/globals.css](/Users/Shared/Projects/checklist/src/app/globals.css)
- semantic surface helpers in [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- state semantics in [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts)
- interaction helpers in [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- typography primitives in [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- card shell in [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- modal shell in [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- page/layout primitives in [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- reporting and chart adapters in [src/components/gds/reporting.tsx](/Users/Shared/Projects/checklist/src/components/gds/reporting.tsx)

## Local Adapter Inventory

Required GDS contract families map to these local files:

- app shell: `src/components/ui/app-shell.tsx`
- page header: `src/components/ui/app-shell.tsx`
- product card: `src/components/ui/unified-card.tsx`
- metric/progress card: `src/components/ui/app-shell.tsx`
- state block and empty-state surface: `src/components/ui/app-shell.tsx`
- reporting sections and validated charts: `src/components/gds/reporting.tsx`
- article/docs shell: not currently implemented as a first-class local contract
- auth shell: not currently implemented as a first-class local contract
- data toolbar/responsive data view: no single shared local contract yet; per-surface implementations remain a backlog item rather than an approved alternate authority

Known exception / migration backlog:

- CHECKLIST still uses approved local compatibility adapters while migrating feature surfaces to package-native GDS primitives.
- Shared contract families not yet centralized into one local adapter file remain backlog, not parallel authority.
- Strict enforcement is active in `gds-adoption.json`; the current adapter count is 14 approved compatibility bridges, with 2 brand exceptions and 8 expiring strict native-dialog exceptions.
- Native browser dialogs are not approved for new work. Existing dialog debt is tracked in `strictExceptions` and must be replaced with GDS runtime feedback confirmations by the listed review date.

## Core Non-Negotiable Rules

1. GDS is the only approved UI framework.
2. Package-native GDS primitives are the preferred implementation authority; approved local adapters are tracked in `gds-adoption.json`.
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

- package-native GDS primitives
- approved compatibility adapters
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
- `Text`
- `Title`

Rules:

- no feature-level `fontSize`
- no feature-level `letterSpacing`
- no ad hoc title hierarchy
- no ornamental all-caps text treatment as hierarchy chrome
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

## Reporting Architecture

Approved reporting source:

- `GdsReportingSection`
- `GdsReportingBarChart`
- `validateGdsChartData`
- `GdsChart` table fallback

Rules:

- analytics-heavy surfaces must normalize chart data into the GDS chart datum contract
- chart data must pass GDS validation before rendering
- chart panels must include text summary and a table fallback through the GDS chart contract
- direct route-level Recharts composition is a migration backlog item, not an approved final pattern

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
npm run verify:gds-compliance
npm run build
```

Strict enforcement rules:

- `gds-adoption.json` must keep `mode: "strict"` and `strictMode: true` unless a rollback is explicitly documented.
- every strict exception requires owner, reason, replacement path, review date, and expiry behavior
- new direct Mantine, Tabler, Recharts, drag/drop, native-dialog, or route-local transition drift fails `npm run test:gds-strict-enforcement`
- obsolete local adapters may be removed only after the strict test proves no imports remain and the manifest adapter count is updated

If a new drift pattern is discovered:

1. fix code
2. update this document
3. update [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
4. harden [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)
5. update [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

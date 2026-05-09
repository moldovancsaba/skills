# CHECKLIST Design System
**v0.15.3: Semantic Mantine Architecture**

This is the current product design-system source of truth in prose form.

Implementation authority lives in:
- `src/app/globals.css`
- `src/components/providers.tsx`
- `src/lib/semantic-theme.ts`
- `scripts/semantic-audit.mjs`

## Core Rules

1. Mantine is the only UI system.
2. Visual meaning is expressed through semantic tones, not raw hue names.
3. Surfaces must be built from shared semantic helpers and global tokens.
4. Light and dark mode are both first-class token sets.
5. State styling must resolve through the product state layer, not raw `red/green/orange` conventions.
6. Motion is globally disabled; feature code must not declare local transitions or animation wrappers.
7. Component defaults belong in the theme layer, not in local feature code.
8. Drift prevention is enforced through audit scripts, not documentation alone.

## Semantic Tones

Approved tones:
- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

Migration aliases:
- `brand`, `blue` -> `ingress`
- `indigo` -> `synthesis`
- `teal`, `green`, `knowledge` -> `knowmore`
- `violet`, `purple` -> `strategy`
- `cyan`, `execution` -> `checklist`
- `orange`, `amber` -> `review`

## Surface Architecture

Use the semantic helper layer in `src/lib/semantic-theme.ts`.

Primary helpers:
- `getSemanticSurfaceStyle(tone, { elevated })`
- `getSemanticHoverStyle(tone)`
- `getSemanticInsetStyle(tone)`
- `getSemanticCalloutStyle(tone)`
- `getSidebarActiveStyle(tone)`
- `getSidebarHoverStyle(tone)`

State helpers:
- `resolveStateTone(state)`
- `resolveStateTextColor(state)`

Rules:
- Cards and panels should use semantic surfaces, not one-off rgba backgrounds.
- Inset areas inside cards should use `getSemanticInsetStyle(...)`.
- Annotation or highlighted note panels should use `getSemanticCalloutStyle(...)`.
- Navigation active states must use the sidebar semantic helpers.

## Theme Defaults

Defined centrally in `src/components/providers.tsx`:
- `Inter` typography
- `md` default radius
- semantic color scales
- component defaults for buttons, cards, badges, text, titles, inputs, modals, and dividers

## Prohibited Patterns

The following are treated as design-system violations:
- raw legacy color props like `color="brand"` or `color="orange"`
- raw Mantine dark palette references like `var(--mantine-color-dark-4)`
- undefined or ad hoc surface tokens like `var(--surface-subtle)`
- hand-rolled translucent glass panels such as `rgba(255,255,255,0.03)` or `rgba(0,0,0,0.2)`
- old `light-dark(...)` helpers
- raw `red` state styling
- local transition declarations or Mantine `Transition` wrappers
- local parallel styling systems

## Global Information

- Product UI uses a semantic multi-tone system, not the older marketing green-primary palette.
- The marketing brand doc is not the product-theme source of truth.
- `scripts/semantic-audit.mjs` should be expanded whenever a new category of drift is discovered.

## Architecture Guidance

When building new UI:
- start with the semantic tone
- choose the matching shared surface helper
- rely on theme defaults for component behavior
- only use local style objects for layout or one-off structural constraints

When refactoring old UI:
- replace raw color props with semantic tones
- replace local rgba surfaces with semantic helper functions
- remove duplicate border/radius/shadow logic
- add new audit rules when a pattern is proven harmful

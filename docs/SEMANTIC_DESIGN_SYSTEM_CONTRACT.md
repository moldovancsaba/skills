# Semantic Design System Contract

## Purpose

This contract defines the only approved semantic vocabulary for product surfaces in `CHECKLIST`.
It exists to prevent runtime regressions caused by mixing generic UI colors with product meanings.

## Allowed Product Tones

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

## Semantic Rules

1. Product surfaces must use semantic tones, not generic color names.
2. Shared primitives must resolve unknown values safely to `neutral`.
3. Any fallback must warn once in runtime, never crash the route.
4. Page code may use aliases only through the central resolver in [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts).
5. Direct style literals like `light-dark(...)` are forbidden on product surfaces.

## Approved Alias Mapping

- `brand`, `blue` -> `ingress`
- `indigo` -> `synthesis`
- `teal`, `green`, `knowledge` -> `knowmore`
- `violet`, `purple` -> `strategy`
- `cyan`, `execution` -> `checklist`
- `orange`, `amber` -> `review`

## Forbidden Patterns

- `color="brand"` on product surfaces
- `color="blue"`, `green`, `orange`, `violet`, `cyan`, `teal`, `indigo` on product surfaces
- `light-dark(...)` in `src/app`, `src/components`, `src/lib`
- product UI relying on ad hoc gradients or color literals instead of semantic helpers

## Enforcement

- Static audit: `npm run audit:semantic`
- Runtime smoke: `npm run smoke:routes`
- Build gate: `npm run build`

## High-Risk Shared Entry Points

- [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- [src/app/client-nav.tsx](/Users/Shared/Projects/checklist/src/app/client-nav.tsx)

## Release Checklist

1. `npm run audit:semantic`
2. `npm run build`
3. `npm run smoke:routes`
4. Visual QA on dashboard, data, knowmore, goals, checklist, tactical

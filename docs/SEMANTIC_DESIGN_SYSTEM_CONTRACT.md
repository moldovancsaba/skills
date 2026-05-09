# Semantic Design System Contract

This document defines the semantic vocabulary and enforcement rules for the live CHECKLIST product UI.

It is subordinate to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md).

## Allowed Product Tones

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

## Rules

1. Product surfaces must use semantic tones, not raw hue names.
2. Shared primitives must resolve only approved product tones.
3. Legacy hue aliases are not part of the live public API.
4. Unknown values must fail safe to `neutral`.
5. Product color meaning must not be invented locally in feature code.

## Surface Contract

Product surfaces must be built through:

- Mantine `Card`
- `UnifiedCard`
- `UnifiedCardSection`
- shared semantic helpers in `src/lib/semantic-theme.ts`

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
- raw feature-level `Card` product surfaces
- local color literals replacing semantic helpers
- local `light-dark(...)`

## High-Risk Files

- [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- [src/app/client-nav.tsx](/Users/Shared/Projects/checklist/src/app/client-nav.tsx)

## Enforcement

Required checks:

```bash
npm run audit:docs
npm run audit:semantic
npm run lint
npx tsc --noEmit
```

When a new forbidden pattern is discovered:

1. fix the code
2. add the rule to the rulebook
3. add the enforcement to the audit when possible
4. update the handover

# CHECKLIST Design System Agent Handoff

Use this document when another agent must refactor a separate project to match the CHECKLIST product UI contract.

This is not a brand memo.
This is an implementation rule set.

Professional operating rule:

- state explicit rules exactly
- do not soften `Mantine only` into weaker wording
- do not claim DS compliance while orphan implementations remain

Read first:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [DESIGN_SYSTEM.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM.md)

## What We Use

- Mantine only
- Mantine theme as the styling base
- Mantine `Card` as the base card primitive
- `UnifiedCard` as the only approved feature-level card shell
- `UnifiedCardModal` as the only approved modal content shell
- semantic tone names for product meaning
- centralized typography primitives
- centralized interaction helpers

## What We Do Not Use

- Tailwind utilities for product UI
- shadcn UI fragments for product UI
- raw `Paper` product surfaces
- raw feature-level `Card` product surfaces
- legacy hue aliases as public DS vocabulary
- local type scales
- local hover systems
- local transition systems
- alternate card shells

## Required Semantic Vocabulary

Allowed tones:

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

## Required Card Architecture

Build product card surfaces through this hierarchy only:

- Mantine `Card`
- `UnifiedCard`
- `UnifiedCardBody`
- `UnifiedCardSection`
- `UnifiedCardActions`
- `UnifiedCardFooter`

Rules:

- feature code must not instantiate its own visual card system
- card sections must use the shared DS layer
- modal shells must visually match the card system

## Required Typography Architecture

Typography must be centralized into:

- theme scale in `providers.tsx`
- DS primitives in `typography.tsx`

Approved roles:

- `PageTitle`
- `SectionTitle`
- `CardTitle`
- `BodyText`
- `MetaText`
- `LabelText`
- `ActionLabel`

## Required Interaction Architecture

Centralize:

- surface hover behavior
- nav hover behavior
- shared interaction styling

Do not allow:

- local transition declarations
- feature-level hover style recipes
- component-specific motion systems for product surfaces

## Files That Define The Live Contract

- `src/components/providers.tsx`
- `src/app/globals.css`
- `src/lib/semantic-theme.ts`
- `src/lib/ui-state.ts`
- `src/lib/ui-interactions.ts`
- `src/components/ui/typography.tsx`
- `src/components/ui/unified-card.tsx`
- `src/components/ui/unified-card-modal.tsx`
- `src/components/ui/app-shell.tsx`
- `scripts/semantic-audit.mjs`

## Migration Rules For Another Project

1. Establish one UI framework.
2. Establish one theme layer.
3. Collapse all product card surfaces onto one shared wrapper.
4. Replace hue-first color naming with semantic naming.
5. Create centralized typography primitives before removing overrides.
6. Centralize interactions before deleting local hover logic.
7. Add static enforcement so drift fails automatically.

## Mandatory Update Rule

If the design system changes, the agent must update:

- the rulebook
- the design-system doc
- the handover
- the audit

If that does not happen in the same work, the refactor is incomplete.

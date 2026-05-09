# CHECKLIST System Design LLD

This document describes how the live system is structured at implementation level.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)

## 1. Runtime Architecture

Primary layers:

- web application
- database and persistence
- autonomous AI loop
- shared product UI system

## 2. Frontend Architecture

The frontend is intentionally rigid.

### 2.1 Approved stack

- Next.js App Router
- React
- Mantine

### 2.2 Approved design-system structure

- `providers.tsx` defines the Mantine theme
- `globals.css` defines the token layer
- `semantic-theme.ts` defines semantic surface helpers
- `ui-state.ts` defines state semantics
- `ui-interactions.ts` defines interaction helpers
- `typography.tsx` defines DS text primitives
- `unified-card.tsx` defines the card shell hierarchy
- `unified-card-modal.tsx` defines the modal shell
- `app-shell.tsx` defines page and layout primitives

### 2.3 Rigid UI rules

- Mantine only
- Mantine `Card` only as base card primitive
- feature code uses `UnifiedCard`
- feature code does not create parallel card shells
- feature code does not create local type systems
- feature code does not create local hover/motion systems

## 3. Semantic Surface Model

All product surface meaning must resolve through semantic tones:

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

All product surfaces must derive from the semantic helper layer and Mantine theme.

## 4. Enforcement Model

Architecture is protected through:

- coding standards
- documentation hierarchy
- semantic audit
- linting
- type-checking

Required commands:

```bash
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

## 5. Documentation Synchronization Rule

Implementation and documentation are part of the same system.

When the system contract changes:

1. update code
2. update the rulebook
3. update the affected contract docs
4. update the handover
5. run enforcement checks

If step 2 through 4 do not happen, the system design work is incomplete.

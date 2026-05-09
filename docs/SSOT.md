# CHECKLIST Product SSOT

This is the product and system single source of truth.

It is subordinate only to [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md).

## 1. Product Purpose

CHECKLIST is a continuously operating, multi-tenant intelligence system that transforms raw business evidence into structured knowledge, goals, and tactical work.

## 2. Core Model

The product is card-based.

Primary user-facing layers:

- Data
- Topics
- Knowmore
- Goals
- Checklist
- Tactical
- Review
- Worker Queue

## 3. System Stack

Backend and orchestration:

- Next.js
- Prisma
- MongoDB Atlas
- Ollama

Frontend:

- Mantine only
- centralized Mantine theme
- centralized semantic token layer
- centralized card system through `UnifiedCard`

## 4. Product UI SSOT

The product UI contract is:

- Mantine only
- semantic tones only
- Mantine `Card` as base primitive
- `UnifiedCard` as feature-level card API
- `UnifiedCardModal` as modal content shell
- centralized typography
- centralized interactions

This contract is implemented in:

- `src/components/providers.tsx`
- `src/app/globals.css`
- `src/lib/semantic-theme.ts`
- `src/lib/ui-state.ts`
- `src/lib/ui-interactions.ts`
- `src/components/ui/typography.tsx`
- `src/components/ui/unified-card.tsx`
- `src/components/ui/unified-card-modal.tsx`
- `src/components/ui/app-shell.tsx`

## 5. Processing Model

The autonomous cycle remains:

1. load companies
2. select fairly
3. pull new evidence and feedback
4. teach memory
5. process through the AI pipeline
6. update statuses and expirations
7. push results back

The repetitive-job contract now also includes:

- persisted `PipelineJob` queue records
- explicit `AI_ONLY` vs `HUMAN_GUIDED` scheduling modes
- a webapp `Worker Queue` board as the primary HiTL steering surface for repetitive jobs
- one-step reset back to AI-only scheduling

## 6. AI Brain Rule

In CHECKLIST, the “AI brain” is not just model prompts.
It also includes the repository rule and handover documents that future agents use as operating memory.

Whenever the live contract changes, the AI brain must be updated in the same work.

Minimum required updates:

- `docs/RULEBOOK.md`
- `HANDOVER.md`

Plus every directly affected deeper contract doc.

## 7. Completion Rule

A change is incomplete if:

- code changed
- but the contract docs still describe the old system

That is treated as a system integrity failure, not a documentation nice-to-have.

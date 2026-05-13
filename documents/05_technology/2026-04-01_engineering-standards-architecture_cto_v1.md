# Engineering Standards and Architecture Documentation

**Title:** Engineering Standards and Architecture  
**Owner:** Chief Technology Officer (CTO)  
**Purpose:** Define coding standards, architectural principles, and technical quality gates for all engineering work  
**Status:** Active  
**Last Updated:** 2026-05-09  
**Version:** v2  
**Relevant Team:** Technology / Engineering  

## 1. Repository Rule Hierarchy

Engineering must follow this precedence:

1. `docs/RULEBOOK.md`
2. `docs/SSOT.md`
3. `docs/SYSTEM_DESIGN_LLD.md`
4. `DESIGN_SYSTEM.md`
5. `HANDOVER.md`

No local team convention is allowed to override those documents.

## 2. Approved Stack

Application stack:

- Next.js 16 App Router
- React 18
- Mantine 7
- Tabler Icons
- Prisma
- MongoDB Atlas
- Ollama

## 3. Frontend Architecture Rules

### 3.1 UI framework

- Mantine only
- no Tailwind utilities for product UI
- no shadcn UI fragments for product UI

### 3.2 Card architecture

- Mantine `Card` is the only approved base card primitive
- `UnifiedCard` is the only approved feature-level product card API
- `UnifiedCardModal` is the only approved modal content shell for product card content
- feature code must not create parallel card shells
- feature code must not use raw `Paper` for product card surfaces

### 3.3 Typography

- typography is centrally defined only
- theme scale lives in `src/components/providers.tsx`
- DS text roles live in `src/components/ui/typography.tsx`
- feature code must not define local text scales

### 3.4 Interactions

- hover and surface interaction behavior is centralized
- no local transition systems
- no local product-surface motion systems

## 4. Coding Standards

### 4.0 Professional truthfulness standard

Engineering communication and repository maintenance must be professionally exact.

Required behavior:

- do not hallucinate facts, compliance, status, or rules
- do not soften explicit standards into weaker wording
- do not use vague filler language to conceal uncertainty
- do not describe partial compliance as completed compliance

### 4.1 Documentation synchronization

If a system contract changes, documentation must change in the same work.

Required minimum updates:

- `docs/RULEBOOK.md`
- `HANDOVER.md`

Plus all directly affected contract docs.

### 4.2 Design-system integrity

Engineers must:

- use approved DS primitives
- avoid local visual exceptions
- harden static enforcement when a new drift pattern is found

### 4.3 Review gate

A UI change is not complete unless reviewers can answer:

- what stack is being used
- which file is the source of truth
- whether the change updated the AI brain docs
- whether the change hardened enforcement if needed

## 5. Quality Gates

Before merge:

- `npm run audit:docs`
- `npm run lint`
- `npm run audit:semantic`
- `npx tsc --noEmit`

## 6. Definition Of Done

Engineering work is done only when:

- implementation follows the approved stack
- no parallel architecture was introduced
- documentation was updated with the same change
- verification commands passed

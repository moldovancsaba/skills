# CHECKLIST Rulebook

This is the highest-priority repository rulebook.

Its job is to remove ambiguity for engineers, agents, and future maintainers.
If another document, prompt, handover, or local pattern conflicts with this file, this file wins.

## 1. Documentation Precedence

The repository must be interpreted in this order:

1. `docs/RULEBOOK.md`
2. `docs/SSOT.md`
3. `docs/SYSTEM_DESIGN_LLD.md`
4. `DESIGN_SYSTEM.md`
5. `docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md`
6. `HANDOVER.md`
7. `DESIGN_SYSTEM_AGENT_HANDOFF.md`
8. any older plan, audit, or historical note

No lower document is allowed to redefine a higher-level rule.

## 2. What We Use

Approved application stack:

- Next.js 16 App Router
- React 18
- Mantine 7
- Tabler Icons
- Prisma
- MongoDB Atlas
- Ollama

Approved product UI system:

- Mantine only
- Mantine theme only
- Mantine `Card` as the only approved base card primitive
- `UnifiedCard` as the only approved feature-level product card API
- `UnifiedCardModal` as the only approved modal content shell for product cards
- first-class entity card surfaces must expose canonical ICE through the shared card header contract
- semantic tones only for product color meaning
- ICE updates, rescoring, and repair must run through shared scoring contracts and oldest-first maintenance or queue flows, not local ad hoc math

## 3. What We Do Not Use

Forbidden for product UI:

- Tailwind utility styling
- shadcn component fragments
- raw feature-level `Paper` surfaces
- raw feature-level `Card` surfaces for product-owned card UI
- parallel visual systems
- local color vocabularies
- local type scales
- local hover systems
- local transition systems

Allowed exception:

- low-level Mantine primitives inside design-system components themselves

## 4. Frontend SSOT Files

These files define the live UI contract:

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

If you change product UI architecture and do not update the relevant SSOT file, the work is incomplete.

## 5. Card Architecture Rules

The card system is rigid.

The approved hierarchy is:

- Mantine `Card`
- `UnifiedCard`
- `UnifiedCardBody`
- `UnifiedCardSection`
- `UnifiedCardActions`
- `UnifiedCardFooter`

Rules:

- feature code must use `UnifiedCard`, not raw `Card` or `Paper`, for product card surfaces
- `UnifiedCard` must remain a strict wrapper over Mantine `Card`
- `UnifiedCardModal` must use the same visual language as `UnifiedCard`
- card sections must use shared helpers, not one-off borders, shadows, or background recipes
- feature code must not pass arbitrary visual overrides into the `UnifiedCard` family

## 6. Typography Rules

Typography is centrally defined only.

Authoritative sources:

- Mantine theme in `src/components/providers.tsx`
- DS text primitives in `src/components/ui/typography.tsx`

Rules:

- no feature-level `fontSize` overrides
- no feature-level `letterSpacing` overrides
- no custom title scales in feature code
- no “just this one” text treatment outside DS primitives unless it is structural and approved in the same change

If a new text role is needed:

1. add or update a DS typography primitive
2. update docs
3. use that primitive everywhere needed

## 7. Semantic Tone Rules

Allowed tones:

- `ingress`
- `synthesis`
- `knowmore`
- `strategy`
- `checklist`
- `tactical`
- `review`
- `neutral`

Rules:

- feature code must use semantic tone names only
- legacy hue aliases are not part of the live API
- state meaning must resolve through `ui-state.ts`, not raw `red`, `green`, or `orange`

## 8. Interaction Rules

Interaction behavior is centralized.

Authoritative sources:

- `src/lib/ui-interactions.ts`
- shared UI shells in `src/components/ui`

Rules:

- no feature-level surface hover systems unless first promoted into shared DS behavior
- no local transitions on product surfaces
- no component-specific motion systems that conflict with the global no-motion rule

## 9. AI Brain Update Rules

In this repository, “AI brain” means the documentation, handover, and rule files that future agents use as operating memory.

The AI brain must be updated immediately when any of these change:

- approved stack
- UI framework rules
- DS primitives
- semantic tone vocabulary
- scoring contract
- AI pipeline stages
- status model
- concurrency or locking model
- card lifecycle rules
- share/permalink behavior
- user-facing system terminology
- local worker queue contract
- autonomous vs human-guided scheduling rules

Required update matrix:

- stack change:
  - update `README.md`
  - update `docs/RULEBOOK.md`
  - update engineering standards doc
- UI architecture change:
  - update `README.md`
  - update `docs/RULEBOOK.md`
  - update `DESIGN_SYSTEM.md`
  - update `docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md`
  - update `HANDOVER.md`
- AI/system architecture change:
  - update `docs/RULEBOOK.md`
  - update `docs/SSOT.md`
  - update `docs/SYSTEM_DESIGN_LLD.md`
  - update `HANDOVER.md`
- agent-facing operating change:
  - update `HANDOVER.md`
  - update `DESIGN_SYSTEM_AGENT_HANDOFF.md` if UI-related

## 10. Mandatory Completion Rules

Work is not complete if any of the following are true:

- code changed but the governing docs did not
- a new pattern exists in code but is not described in the rulebook
- a legacy pattern was removed but the docs still permit it
- a lower-priority handover contradicts the live system

## 11. Enforcement

Required checks for UI and architecture work:

```bash
npm run audit:docs
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

If a new category of drift is discovered:

1. fix the code
2. update the rulebook
3. harden the audit or static enforcement
4. update the handover

That sequence is mandatory.

## 12. CI Rule

The repository must keep automated guards in version control.

Current workflow:

- `.github/workflows/repo-guards.yml`

The workflow must enforce:

- `npm run audit:docs`
- `npm run audit:semantic`
- `npm run lint`
- `npx tsc --noEmit`

## 13. Pipeline Queue Rules

The local AI pipeline queue is now a first-class system contract.

Rules:

- repetitive local-AI work must be representable as persisted `PipelineJob` records
- the webapp `Worker Queue` is the primary human steering surface for repetitive jobs
- worker execution must consume the persisted queue contract, not hidden module-local ordering alone
- `AI_ONLY` and `HUMAN_GUIDED` are explicit scheduling modes
- `Reset to AI only` must fully clear manual queue influence for the selected scope
- shipped human queue controls must remain simple: drag/drop between queue columns, drag/drop manual ordering, and `Reset to AI Only`
- do not document or imply a separate tweak menu unless it actually exists in the webapp
- suspicious or critical score-health states must be able to reprioritize queue work through the shared queue contract
- fairness-sensitive recalculation work must continue to preserve oldest-first behavior unless explicitly human-overridden

# CHECKLIST Rulebook

This is the highest-priority repository rulebook.

Its job is to remove ambiguity for engineers, agents, and future maintainers.
If another document, prompt, handover, or local pattern conflicts with this file, this file wins.

## 1. Documentation Precedence

The repository must be interpreted in this order:

1. `docs/RULEBOOK.md`
2. `docs/SSOT.md`
3. `docs/SYSTEM_DESIGN_LLD.md`
4. `docs/IMPLEMENTATION_RULEBOOK.md`
5. `DESIGN_SYSTEM.md`
6. `docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md`
7. `HANDOVER.md`
8. `DESIGN_SYSTEM_AGENT_HANDOFF.md`
9. any older plan, audit, or historical note

No lower document is allowed to redefine a higher-level rule.

## 1.1 Professional Truthfulness Rule

This repository is maintained under professional product-development standards.

Non-negotiable behavior:

- no hallucinated facts
- no softening of explicit rules
- no vague or inflated wording used to cover uncertainty
- no ambiguous restatement of an explicit repository rule
- no claiming compliance when the code is only partially compliant

When the written rule is explicit, it must be stated exactly.
When the system is non-compliant, that must be stated directly.

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
- DS-owned `Text` and `Title` wrappers in `src/components/ui/typography.tsx` are the only approved general-purpose typography escape hatches
- first-class entity card surfaces must expose canonical ICE through the shared card header contract
- first-class entity detail views must render all persisted type-specific fields through the shared `UnifiedCard` / `UnifiedCardModal` grammar; summary cards may preview, detail views may not silently drop known persisted fields
- semantic tones only for product color meaning
- ICE updates, rescoring, and repair must run through shared scoring contracts and oldest-first maintenance or queue flows, not local ad hoc math
- opportunitycards are part of the task-like scoring family: they must normalize through the shared task scoring contract, persist normalized metrics plus `scoreProfile`, and must not persist ad hoc raw ICE fields on create, update, modify, refresh, or repair paths
- historical opportunitycard contract repair must be callable through the shared bounded repair module and must execute from the DB-backed worker startup integrity path; local scripts may reuse that module but are not the only authoritative execution lane
- opportunity discovery is worker-owned by default: internet search, company-candidate filtering, draft lead creation, enrichment, dedupe, and follow-up refresh must execute in the local AI worker, not as ad hoc hosted-webapp logic
- opportunity search must be self-improving by default: successful queries, accepted leads, and declined leads must persist into per-company search memory so future internet-search query selection is shaped by real operator outcomes rather than static heuristics
- mined internet leads must start as `DRAFT` opportunitycards with preserved search provenance; operator `ACCEPT` and `DECLINE` are authoritative signals that must reward or penalize the originating search query/domain/terms
- score generation must persist provenance between agent proposal, calibrated heuristic score, and final blended score profile
- tactical placement must use the shared blended priority contract, which keeps ICE visible but ranks work through explainable ICE, quality, urgency, freshness, human-signal, risk, lifecycle-state, and memory inputs
- tactical placement must use relative ranking within the active peer pool; fixed scalar thresholds are not sufficient on their own
- source-backed knowledge must persist durable citation snapshots and explicit conflict state; URL-only provenance is not accepted
- the active self-learning path must stay Apple-Silicon-native: dataset export plus MLX / MLX-LM training plus Ollama deployment
- Unsloth, LLaMA-Factory, and Axolotl are not part of the active delivery plan today and must not be represented as current rollout dependencies

## 3. What We Do Not Use

Forbidden for product UI:

- Tailwind utility styling
- shadcn component fragments
- raw feature-level `Paper` surfaces
- raw feature-level `Card` surfaces for product-owned card UI
- raw feature-level DOM nodes such as `div`, `span`, `section`, and `main` when an approved Mantine or DS primitive should be used instead
- feature-level `className` hooks
- raw Mantine `Text` imports in feature code
- raw Mantine `Title` imports in feature code
- parallel visual systems
- local color vocabularies
- local type scales
- local hover systems
- local transition systems

Allowed exception:

- low-level Mantine primitives inside design-system components themselves

## 3.1 Communication Standard For Engineers And Agents

All engineering and agent communication in this repository must be:

- direct
- precise
- verifiable
- unambiguous
- professionally plainspoken

Forbidden communication behavior:

- hedging away a hard rule
- “close enough” summaries that change rule meaning
- pseudo-professional filler wording
- vague claims of readiness, compliance, or completion
- inventing rationale that is not present in the code or governing docs

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
- shared app-shell product surfaces such as route cards, metric cards, and empty states must also resolve through `UnifiedCard`
- `UnifiedCardModal` must use the same visual language as `UnifiedCard`
- card sections must use shared helpers, not one-off borders, shadows, or background recipes
- feature-level accent rails, dropzones, side panels, bullets, and overlay shadows must resolve through shared semantic helpers rather than local inline recipes
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

Allowed product typography roles are intentionally limited:

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

- feature surfaces must collapse visible copy into these roles instead of inventing local title ladders
- feature code must not import `Text` or `Title` from `@mantine/core`; it must import the DS-owned wrappers from `src/components/ui/typography.tsx`
- decorative filler labels are forbidden
- repeated orientation copy such as “Access Layer” is forbidden when the route title, icon, and click behavior already express the same meaning
- sidebar labels, card counts, footer/legal text, and route-card descriptions must reuse the approved roles instead of local `Text size=...` patterns

## 6.1 Layout Grammar Rules

Layout grammar is part of the design system, not a page-level preference.

Primary dashboard and navigation rules:

- the sidebar, route-card grid, and section headers must read as one hierarchy system
- first-level route cards must share one structural grammar:
  - icon
  - metric or count
  - title
  - optional short description or optional chart
- route cards must not add decorative footer copy to simulate hierarchy
- first-level route cards must use one shared density model and one shared height model per breakpoint
- route-card grids must use deliberate balanced column rules; accidental `5 + 3` or similar wraps are not acceptable
- one semantic item must map to one semantic tone only
- buttons, badges, and legal/footer chrome must not introduce ornamental all-caps or decorative emphasis as a substitute for structure
- page sections must create hierarchy through spacing, grouping, and the approved type roles, not through extra labels or extra decoration

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
- product-boundary rules

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
  - update `docs/IMPLEMENTATION_RULEBOOK.md` if delivery/build rules changed
  - update `HANDOVER.md`
- agent-facing operating change:
  - update `AGENT.md`
  - update `SOUL.md`
  - update `agents/README.md`
  - update `skills/README.md` if repo-local skill guidance is affected
  - update `HANDOVER.md`
  - update `DESIGN_SYSTEM_AGENT_HANDOFF.md` if UI-related

## 9.1 Implementation Rulebook

Future product functions must follow the shared implementation rulebook.

Authoritative file:

- `docs/IMPLEMENTATION_RULEBOOK.md`

Non-negotiable rules:

- hot product routes must be projection-first
- server bootstrap is preferred over post-mount client waterfalls
- route payloads must be minimal and explicit
- non-critical hydration and rendering must be deferred
- stale prepared data must be repaired through background ownership
- profiling is required before speculative performance trimming once the obvious architectural problems are removed

Budget governor rules:

- AI workload usage must be attributed by company and feature before it is used for budget pressure or controls
- estimated cost, workload units, retries, external requests, and runtime must remain visibly distinguishable from actual invoiced provider spend
- budget controls must be explicit operator-applied policies or events; they must not silently suppress critical evidence, safety, evaluation, or human-guided queue work
- budget events must distinguish high-cost high-value work from likely waste such as retry storms, repeated failed jobs, or low-value repeated generation
- Observability is the first budget-governor surface; budget controls must stay bounded to throttle, batch, cache/reuse, review-required, or pause policies until the system has stronger outcome evidence

## 10. Product Boundary And Backlog Rules

Checklist-core must stay within this product definition:

- general company decision-maker
- task manager
- AI support system

Checklist-core may include:

- evidence ingestion and enrichment
- knowledge synthesis
- grounded answers and search
- goals, planning, checklist work, and review
- worker queue steering
- observability
- bounded workflows
- evidence-backed forecasting, benchmarking, policy, and decision-support layers that serve general company operations

Checklist-core must not quietly expand into first-class vertical products such as:

- athlete or coach apps
- marketing content studios
- email-sequencing tools
- SEO workbenches
- lead-scoring or outbound-sales execution systems
- objection-handling playbook products
- channel-execution suites

Rules:

- vertical or experimental ideas belong in `IDEABANK` until explicitly promoted
- autonomous implementation must work from active delivery columns, not from the `IDEABANK` column
- issue labels or ideabank titles do not override board state; if an item is in `IDEABANK`, it is research-only by default
- ideabank or vertical items must not be exposed in checklist navigation, checklist product SSOT docs, or checklist-core release claims
- athlete-specific work does not belong on the checklist project board; it belongs on the dedicated athlete project board
- the only allowed internal exception is `Evaluation Bench` as an admin-only AI quality-governance surface; it must stay outside the main checklist navigation and be framed as internal observability/governance tooling

## 11. Mandatory Completion Rules

Work is not complete if any of the following are true:

- code changed but the governing docs did not
- a new pattern exists in code but is not described in the rulebook
- a legacy pattern was removed but the docs still permit it
- a lower-priority handover contradicts the live system

## 12. Enforcement

Required checks for UI and architecture work:

```bash
npm run db:generate
npm run audit:docs
npm run lint
npm run audit:semantic
npx tsc --noEmit
```

Prisma client synchronization rule:

- if `prisma/schema.prisma` changed, or you switched to a commit/branch with different Prisma model definitions, run `npm run db:generate` before lint or typecheck
- do not treat generated Prisma client drift as an application-code defect until regeneration is verified

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

- `npm run db:generate`
- `npm run audit:docs`
- `npm run audit:semantic`
- `npm run lint`
- `npx tsc --noEmit`

## 13. Pipeline Queue Rules

The local AI pipeline queue is now a first-class system contract.

Rules:

- repetitive local-AI work must be representable as persisted `PipelineJob` records
- the webapp `AI Queue` is the primary human steering surface for repetitive jobs
- worker execution must consume the persisted queue contract, not hidden module-local ordering alone
- `AI_ONLY` and `HUMAN_GUIDED` are explicit scheduling modes
- `Reset to AI only` must fully clear manual queue influence for the selected scope
- shipped human queue controls must remain simple: drag/drop between queue columns, drag/drop manual ordering, and `Reset to AI Only`
- do not document or imply a separate tweak menu unless it actually exists in the webapp
- suspicious or critical score-health states must be able to reprioritize queue work through the shared queue contract
- fairness-sensitive recalculation work must continue to preserve oldest-first behavior unless explicitly human-overridden
- Knowmore must expose explicit operator repair visibility and bounded recovery controls rather than forcing support teams to infer knowledge-health state from generic logs
- direct flashcard/source corrections must remain durable, auditable, and consumable by the worker without relying on downstream task feedback alone

## 14. Blended Priority Rules

Raw ICE is the user-visible score, not the only ranking authority.

Rules:

- `src/lib/scoring-contract.js` owns the canonical blended priority profile
- the blended profile must expose both a numeric priority score and component-level reasons
- the scoring contract must preserve decimal internal score precision even if legacy storage fields or UI surfaces round for compatibility
- the live scoring contract is considered closed architecture, not an open speculative overhaul; future work must extend it through the shared scorer, score-health audit, and bounded repair path instead of inventing parallel scoring systems
- the scoring contract must treat company-specific accepted, declined, modified, and delivered history as first-class calibration input for new-card impact/confidence where history exists
- task `ease` must not be inferred from text complexity alone; it must be calibrated from delivery difficulty factors such as dependencies, coordination, expertise burden, time-to-value, and delivery history
- supported priority components are ICE, quality, urgency, freshness, human signal, risk, lifecycle state, and memory signal
- historical flashcard, task, and opportunitycard rescoring must use the bounded `scripts/repair-ice-scores.js` path or the shared worker-owned repair module behind it, and remain compatible with score-health observability
- human-guided planning anchors must remain visible and must not be silently erased by AI reprioritization
- frontier placement and tactical board ordering must use blended priority where available
- frontier placement should be relative-rank based inside the active pool, not raw fixed ICE thresholds alone
- feature code must not invent local ranking math for tactical placement
- task `DELIVER` must remain a stronger first-class outcome than `ACCEPT` and must feed the canonical worker feedback stream plus lineage reward propagation
- task and knowledge lineage fields must be written at generation and refinement time so duplicate suppression, merge/split operations, and downstream reward propagation remain traceable

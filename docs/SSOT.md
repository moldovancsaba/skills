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
- Search & Answers
- Observability
- Workflows

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
- drag/drop queue column changes and drag/drop manual ordering as the shipped human-tweak controls
- no separate compact tweak menu today; the board itself is the canonical tweak surface

The current intelligence-operations contract also includes:

- one unified internal search layer across cards, queue work, and workflow blueprints
- search responses now include entity-type filters, per-layer counts, and ranking that blends text overlap with ICE/freshness cues
- first-class entity search results deep-link into the canonical shared `/card/[uuid]` detail route for Data, Topics, Knowmore, Goals, and Tasks
- one blended tactical priority profile that keeps ICE visible while ranking work through explainable ICE, quality, urgency, freshness, human-signal, risk, lifecycle-state, and memory inputs
- one grounded answer layer over company context using explicit evidence objects
- grounded answers now expose intent, confidence, and evidence-group framing as first-class contract fields
- one observability surface for worker health, queue pressure, score-health, and recent outcomes
- observability also owns bounded repair actions for queue sync, score-repair escalation, and failed-job recovery
- persisted workflow blueprints for bounded automation building, materialized as real worker-queue jobs when active
- persisted enrichment waterfall policies for provider ordering and fallback governance, applied at runtime during URL intelligence enrichment
- one advisory evaluation bench for replaying seeded synthetic intelligence cases before recommendation, grounded-answer, ranking, workflow, and data-readiness changes are promoted
- evaluation failures can be explicitly published into Observability as `EVAL_GATE_FAILED` outcome events; normal replay does not mutate production company data
- one content-generation surface that turns existing company, product, goal, topic, and competitor context into saved `CreativeDraft` records for email subjects, ads, social posts, and landing-page copy
- content generation is draft-only in the current contract: no automated posting, no image generation, and no multi-language generation
- one athlete-facing daily app beside the coach/operator app, backed by `AthleteActivityLog`, where athletes can see assigned checklist work, record activity, readiness, intensity, sleep, soreness, stress, mood, hydration, body weight, pain/nutrition notes, and completion evidence
- one coach-facing athlete records view where admins can review team daily submissions, completion evidence, load, readiness, sleep, soreness, and pain flags
- completing coach-assigned work from the athlete app records an athlete outcome and archives the assigned checklist item as completed

Tactical placement contract:

- `iceScore` remains the visible score on task cards
- `priorityProfile` is the ranking explanation used for tactical ordering and frontier placement
- human drag/drop anchors remain explicit human guidance and are not silently erased by AI scoring
- priority thresholds are applied to blended priority scores, not raw ICE alone

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

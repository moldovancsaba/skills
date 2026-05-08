# ICE Scoring Audit

Date: 2026-05-08

Status update: 2026-05-09

This audit remains valuable as the root-cause record, but parts of the implementation status have changed:

- a canonical shared scoring contract now exists in `src/lib/scoring-contract.js`
- flashcard scale normalization has been corrected to the shared `1-10` model
- periodic rescoring now exists and runs oldest-updated-first
- task scoring no longer uses deterministic jitter; it now grounds task scores through shared normalization plus task/source signals

What is still true:

- this document is the historical explanation of why the old scoring system collapsed
- live score quality should continue to be monitored empirically, especially task tuple repetition and frontier distribution health

## Executive Summary

The current ICE system is not healthy.

The most serious issue is on `NBAItem` taskcards:

- `487` taskcards inspected
- only `12` unique `iceScore` values
- the single most common score, `504`, appears on `309` cards
- this means `63.4%` of all taskcards share the exact same ICE score

The flashcard layer is somewhat better, but still overly collapsed:

- `1501` flashcards inspected
- `117` unique `iceScore` values
- the most common score, `50.4`, appears on `223` cards
- this means `14.9%` of all flashcards share the exact same ICE score

Goalcards are not statistically meaningful yet in this dataset:

- `1` goalcard inspected
- `1` unique `iceScore` value

## Primary Findings

### 1. Taskcard scoring is collapsing into a tiny set of repeated tuples

Observed dominant task tuples from live data:

- `9 | 8 | 7 | 504` occurred `181` times
- `8 | 9 | 7 | 504` occurred `128` times
- `8 | 9 | 6 | 432` occurred `40` times

These are not random user edits. Most come from:

- `createdBy = "drafter-agent"`
- `candidateState = "EVALUATED"`

Source reference:

- [scripts/lib/drafter.js](/Users/Shared/Projects/checklist/scripts/lib/drafter.js)

The generator prompt asks for integer `impact`, `confidence`, and `ease` on a `1-10` scale, then writes:

- `confidenceScore: confidence`
- `impact`
- `ease`
- `iceScore: impact * (confidence / 10) * ease * 10`

That simplifies to:

- `iceScore = impact * confidence * ease`

This creates a small discrete score space and makes collisions extremely common when the model favors a few high-confidence triples.

### 2. The system has inconsistent score scales across layers

Taskcards use:

- `impact: 1-10`
- `confidence: 1-10` in generation, then normalized into the stored ICE path
- `ease: 1-10`

Flashcards use a different convention:

- `confidence: 1-100`
- `impact: expected 1-10 in most app code`
- `weight: expected 1-10 in most app code`

But `makeDraft()` in:

- [src/lib/flashcards.ts](/Users/Shared/Projects/checklist/src/lib/flashcards.ts)

currently clamps:

- `impact` to `1-100`
- `weight` to `1-100`

even though the surrounding comments and downstream routes treat those fields as `1-10`.

This is a structural inconsistency and a real bug.

### 3. Flashcard generation uses many hardcoded score templates

Flashcard drafts are repeatedly created with near-fixed values such as:

- confidence `61`, `62`, `66`
- impact `72`, `74`, `82`, `84`
- weight `70`, `74`, `76`, `80`, `82`

Source reference:

- [src/lib/flashcards.ts](/Users/Shared/Projects/checklist/src/lib/flashcards.ts)

This is why flashcards cluster into repeated ICE values like:

- `8 | 9 | 7 | 50.4`
- `8 | 8 | 7 | 44.8`
- `7 | 8 | 6 | 33.6`

The variation is mostly template-driven, not evidence-driven.

### 4. Invalid task generations silently collapse to `1 | 1 | 1 | 1`

In:

- [scripts/lib/drafter.js](/Users/Shared/Projects/checklist/scripts/lib/drafter.js)

if parsing fails, the task falls back to:

- `confidence = 1`
- `impact = 1`
- `ease = 1`
- `iceScore = 1`
- `processingStatus = "REVIEW"`

This avoids crashes, but it also pollutes the score distribution with meaningless fallback values instead of preserving the raw failure for repair.

### 5. Goalcard creation does not maintain a clean scoring contract

In:

- [src/app/api/goalcards/route.ts](/Users/Shared/Projects/checklist/src/app/api/goalcards/route.ts)

new goalcards are created with:

- `confidence: 50`
- `impact: iceScore ? Math.floor(iceScore / 10) : 5`
- `weight: 5`

This back-solves `impact` from an incoming `iceScore`, which is the wrong direction for a canonical scoring model.

### 6. Conversion paths can move inconsistent score semantics between layers

In:

- [src/app/api/intelligence/convert/route.ts](/Users/Shared/Projects/checklist/src/app/api/intelligence/convert/route.ts)

the conversion flow copies `impact`, `confidence`, and `weight/ease` between entity types without a formal normalization contract.

That means scale inconsistencies can propagate across:

- Flashcard -> Goalcard
- Goalcard -> Taskcard
- Taskcard -> Flashcard

### 7. Frontier orchestration depends on ICE thresholds that assume a stable score distribution

In:

- [scripts/lib/frontier.js](/Users/Shared/Projects/checklist/scripts/lib/frontier.js)

kanban placement relies on fixed thresholds:

- `CHECKLIST >= 700`
- `TODO >= 500`
- `BACKLOG >= 250`
- `ROADMAP >= 100`

When most tasks cluster around `504`, the threshold system stops being discriminative and column placement becomes less meaningful than intended.

### 8. One scratch script can mass-flatten evaluation signals

In:

- [scripts/scratch/force-evaluate.ts](/Users/Shared/Projects/checklist/scripts/scratch/force-evaluate.ts)

the script writes:

- `qualityScore: 0.8`
- `urgencyScore: 0.8`
- `freshnessScore: 1.0`

for all matching rows.

This is not the ICE bug itself, but it is another example of score flattening and should not be used in production data without extreme caution.

## Root Cause Assessment

The ICE problem is not a single bug. It is a system-level scoring design failure with four combined causes:

1. Score generation is template-heavy and low-entropy.
2. Different layers disagree on score scales.
3. The canonical ICE formula is too coarse for the observed input behavior.
4. Conversion and creation paths do not share one strict normalization contract.

## Recommended Repair Plan

### Phase 1. Establish one canonical score contract

Create one shared scoring contract in `src/lib`, for example:

- `score-contract.ts`

It should define:

- flashcard score scale
- goalcard score scale
- taskcard score scale
- canonical normalization rules
- canonical ICE calculation rules

Recommendation:

- use `impact`, `confidence`, and `ease/weight` as `1-10` everywhere
- store normalized values only
- never infer one base metric from a final `iceScore`

### Phase 2. Fix the flashcard draft bug

Update:

- [src/lib/flashcards.ts](/Users/Shared/Projects/checklist/src/lib/flashcards.ts)

so `impact` and `weight` are clamped to `1-10`, not `1-100`.

This is a correctness fix, not an optional improvement.

### Phase 3. Replace template scoring with evidence-based scoring bands

For generation paths:

- [src/lib/flashcards.ts](/Users/Shared/Projects/checklist/src/lib/flashcards.ts)
- [scripts/lib/drafter.js](/Users/Shared/Projects/checklist/scripts/lib/drafter.js)

stop assigning near-static metric triples.

Instead:

- derive score candidates from evidence density
- source diversity
- recency
- strategic alignment
- actionability

Then let the model choose within bounded ranges rather than emitting one of a few baked templates.

### Phase 4. Add anti-collapse validation

Introduce a scoring audit helper that flags suspicious output distributions:

- too many repeated metric triples in one batch
- too many repeated ICE values in one company
- too many fallback `1|1|1`
- too many scores concentrated in a single threshold band

This should run in the worker pipeline and in periodic maintenance.

### Phase 5. Separate ranking score from display score

Recommendation:

- keep a simple human-readable ICE score for display
- add a separate internal ranking score for frontier placement

The ranking score should incorporate:

- ICE
- evaluator `qualityScore`
- urgency
- freshness
- feedback/downrank signals
- duplicate pressure / cluster saturation

This prevents kanban placement from depending on one overly coarse scalar.

### Phase 6. Repair goalcard and conversion scoring paths

Fix:

- [src/app/api/goalcards/route.ts](/Users/Shared/Projects/checklist/src/app/api/goalcards/route.ts)
- [src/app/api/intelligence/convert/route.ts](/Users/Shared/Projects/checklist/src/app/api/intelligence/convert/route.ts)

Rules:

- never derive base metrics from `iceScore`
- always normalize incoming metrics through one shared module
- always recalculate `iceScore` from normalized base metrics

### Phase 7. Migrate existing bad data

After the contract is fixed:

1. backfill all flashcards/goalcards/taskcards through the canonical scorer
2. recompute ICE
3. recompute tactical frontier placement
4. generate a before/after distribution report

## Immediate Priority Order

1. Fix flashcard `1-100` clamp bug.
2. Create one canonical scoring module.
3. Refactor task drafter to stop low-entropy tuple generation.
4. Repair goalcard and conversion write paths.
5. Recompute all stored scores and rerun frontier orchestration.

## Bottom Line

The user concern is valid.

For tasks, the ICE system is effectively collapsed:

- `63.4%` of stored taskcards have the exact same ICE score.

That is strong evidence that the scoring algorithm, as a system, is currently broken.

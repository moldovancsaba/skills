---
name: amanoba-course-author
description: Create, revise, and QA Amanoba courses end-to-end for amanoba.com, including CCS/canonical JSON specs, lesson content (strict v1.0 lesson format), quizzes (no-garbage rules + validator gates), and export/import course packages (v2). Use when asked to design curricula, write lessons/quizzes, build canonical course specs, generate course packages, run quiz/lesson quality checks, or prepare publish-ready course content.
---

# Amanoba Course Author

## SSOT (read before writing)

When working inside the Amanoba repo, treat these as source-of-truth and follow them exactly:

- `docs/amanoba_course_content_standard_v1_0.md` (hard rules + required lesson/quiz format)
- `docs/CREATE_A_COURSE_HANDOVER.md` (end-to-end creation process + QA + smoke tests)
- `docs/COURSE_PACKAGE_FORMAT.md` (export/import JSON schema v2)
- Canonical family spec (example):
  - `docs/canonical/<CCS_ID>/<CCS_ID>_CCS.md`
  - `docs/canonical/<CCS_ID>/<CCS_ID>.canonical.json`
- Quiz validator + hard rejects:
  - `scripts/question-quality-validator.ts` (and the pipeline scripts referenced in the handover)

Internal navigation aid: `references/amanoba-ssot-map.md`.

## Final deliverable (what “done” looks like)

When asked for a “final course” (publish-ready artifact), output a **single v2 course package JSON** in the same shape as:

- `docs/course/SPORT_SALES_NETWORK_EUROPE_2026_EN_export_2026-02-06_RECREATED.json`

That means: `packageVersion: "2.0"`, `course` + `lessons` (30 lessons), each lesson has **v1.0 lesson Markdown** in `content` and a quiz pool that passes the validator gates.

## How to use this skill in chat (idea → agreement → generation)

Operate in two phases:

### Phase 1 — Discuss and agree the course idea (no generation yet)

1. Ask for (or derive) the course:
   - Target student + starting level
   - Student target(s) (what they want to achieve)
   - Constraints (language, time budget, industry/region, pricing/free, certification yes/no)
2. Propose a crisp **1-sentence promise** and 5–10 measurable outcomes.
3. Propose identifiers:
   - `CCS_ID` (family id, `UPPERCASE_UNDERSCORE`)
   - `COURSE_ID` (variant id, typically `${CCS_ID}_${LANG}` like `_EN`)
4. Stop and ask the user to confirm:
   - Topic + audience
   - `CCS_ID` + language token
   - The 1-sentence promise (exact wording)

### Phase 2 — Generate publish-ready artifacts (after explicit confirmation)

Generate:

1. `docs/canonical/<CCS_ID>/<CCS_ID>_CCS.md` (narrative CCS)
2. `docs/canonical/<CCS_ID>/<CCS_ID>.canonical.json` (canonical JSON SSOT)
3. `docs/course/<COURSE_ID>_export_<timestamp>_RECREATED.json` (final v2 course package JSON)

Hard requirement: the final package must match the shape and conventions of:
`docs/course/SPORT_SALES_NETWORK_EUROPE_2026_EN_export_2026-02-06_RECREATED.json`.

## Outcomes

Produce course materials that are:

- Outcome-driven (clear skills students can demonstrate)
- Actionable (practice-first, projects, checklists)
- Supportive (scaffolding, feedback, pacing, FAQs)
- Assessable (rubrics, mastery criteria, answer keys)

## Workflow (Amanoba-aligned)

Follow the repo’s end-to-end workflow (Idea → Outline → CCS → Course → Lessons → Quizzes → QA → Publish) and its safety rules:

1. **Resume or start a run** (mandatory process state)
   - Maintain *one* run log + *one* tasklist (see templates in `assets/`).
2. **Define CCS + canonical JSON**
   - CCS is the family SSOT; canonical JSON is the machine SSOT.
3. **Write lessons using the strict v1.0 format**
   - Lesson sections and ordering are non-negotiable.
   - Enforce deliverable + success criteria + (recommended) baseline metric.
4. **Write quizzes that pass “no garbage” rules**
   - Standalone, scenario-based, grounded, concrete deliverable/outcome.
   - Cognitive mix gates: ≥7 questions, ≥5 application, 0 recall (critical-thinking recommended).
5. **Package for import/export**
   - Output JSON must match `docs/COURSE_PACKAGE_FORMAT.md` v2 shape.
6. **QA + smoke tests**
   - Run lesson audits and quiz pipeline (dry-run first; follow handover).

## Defaults (when not specified)

- Course structure: 30 lessons (day 1–30).
- Lesson length: 20–30 minutes (per quality gates).
- Quiz pool: at least 7 questions/lesson; platform may display fewer per attempt.

## Templates (use assets)

Use the templates in `assets/`:

- `assets/course-spec.md`: course SSOT (ccsId, courseId, outcomes, QA gates)
- `assets/run-log-template.md`: required run log (resume-safe)
- `assets/tasklist-template.md`: required tasklist (resume-safe)
- `assets/idea-intake.md`: idea intake worksheet (Phase 1)
- `assets/canonical-course.template.json`: canonical JSON skeleton (family SSOT)
- `assets/ccs.template.md`: CCS markdown skeleton (family SSOT narrative)
- `assets/lesson.md`: **required lesson format** (aligned to v1.0 standard)
- `assets/quiz.md`: quiz authoring format aligned to validator requirements
- `assets/course-package.v2.template.json`: v2 package skeleton (export/import)
- `assets/module-outline.md`, `assets/assignment.md`, `assets/rubric.md`, `assets/student-support.md`, `assets/course-landing-copy.md`

## Non-negotiable authoring constraints (fast checklist)

- Lesson must include **Who/What/Where/When/Why/How** blocks and action blocks (**Guided**, **Independent**, **Self-check**) in the required order.
- Use only `#`, `##`, `###` headings; max 3 lines per paragraph; prefer bullets.
- Exactly **1 table** per lesson (normally in Guided exercise).
- Exactly **1 callout** per lesson (`> **Pro tip:** ...` or `> **Common mistake:** ...`).
- Quiz questions must be standalone (no “this lesson/course/today/day X”), have exactly 1 correct answer, and avoid “all/none of the above”.
- Quiz gates (per lesson pool): **>=7 total**, **>=5 application**, **0 recall**; options must be concrete and plausible.

## Continuous improvement (make it better over time)

When asked to “improve the skill”, “incorporate student feedback”, or “reduce where students get stuck”, use these references:

- `references/improvement-loop.md`: the process (cadence + steps + quality gates)
- `references/feedback-inbox.md`: where to paste raw feedback and how to format it
- `references/improvements-backlog.md`: prioritized backlog with success metrics
- `references/regression-prompts.md`: canonical prompts to re-run after changes
- `references/release-checklist.md`: lightweight release checklist for skill updates

## Style rules

- Prefer bullets and steps; avoid long prose.
- Teach by doing: every concept gets a worked example and an exercise.
- Call out common mistakes explicitly.
- Use absolute dates when scheduling (e.g., 2026-02-06), not “today”.

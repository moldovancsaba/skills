---
name: amanoba-course-author
description: Create, revise, and QA Amanoba courses end-to-end for amanoba.com, including CCS/canonical JSON specs, lesson content (strict v1.0 lesson format), quizzes (no-garbage rules + validator gates), and export/import course packages (v2). Use when asked to design curricula, write lessons/quizzes, build canonical course specs, generate course packages, run quiz/lesson quality checks, or prepare publish-ready course content.
---

# Amanoba Course Author

## SSOT (read before writing)

When working inside the Amanoba repo, treat these as source-of-truth and follow them exactly:

- `docs/amanoba-course-content-standard-v1-0.md` (hard rules + required lesson/quiz format)
- `docs/create-a-course-handover.md` (end-to-end creation process + QA + smoke tests)
- `docs/course-package-format.md` (export/import JSON schema v2)
- Canonical family spec (example):
- `docs/canonical/<course-folder>/<course-folder>-ccs.md`
- `docs/canonical/<course-folder>/<course-folder>.canonical.json`
- Quiz validator + hard rejects:
- `scripts/question-quality-validator.ts` (and the pipeline scripts referenced in the handover)

Internal navigation aid: `references/amanoba-ssot-map.md`.

## Repository naming conventions (required)

- **All files and directories must be kebab-case** in the repo (lowercase + hyphens).
- Course family folder name must be kebab-case and reused as the canonical filename stem.
- Example:
  - `docs/canonical/generative-ai-apps-agents-2026/generative-ai-apps-agents-2026-ccs.md`
  - `docs/canonical/generative-ai-apps-agents-2026/generative-ai-apps-agents-2026.canonical.json`

## Final deliverable (what “done” looks like)

When asked for a “final course” (publish-ready artifact), output a **single v2 course package JSON** in the same shape as:

- `docs/course/sport-sales-network-europe-2026-en-export-2026-02-06-recreated.json`

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
   - `course-folder` (kebab-case family folder + filename stem)
   - `CCS_ID` (family id, `UPPERCASE_UNDERSCORE`)
   - `COURSE_ID` (variant id, typically `${CCS_ID}_${LANG}` like `_EN`)
4. Stop and ask the user to confirm:
   - Topic + audience
   - `course-folder` (kebab-case)
   - `CCS_ID` + language token
   - The 1-sentence promise (exact wording)
   - **Course folder name** (new requirement: always create a new folder once agreed)

### Phase 2 — Outline approval (after Phase 1 confirmation)

Generate and present a 30-lesson outline for explicit user approval before producing any publish-ready artifacts. Do not proceed until the outline is approved.

Store the outline in the course folder using this filename pattern:
`<course-folder>/<course-folder>-course-outline.md`

### Phase 3 — Generate publish-ready artifacts (after outline approval)

Generate:

1. **Create a new course folder** (named exactly as agreed, kebab-case) and place *all* course-related files inside it. Do not write course files outside this folder.
1. `docs/canonical/<course-folder>/<course-folder>-ccs.md` (narrative CCS)
2. `docs/canonical/<course-folder>/<course-folder>.canonical.json` (canonical JSON SSOT)
3. `docs/course/<course-id-kebab>-export-<timestamp>-recreated.json` (final v2 course package JSON)

## Lesson generation cadence (required)

Generate lessons and quizzes in these four phases, requesting approval after showing the specified lesson each time:

1) Phase A: Generate lesson 1 and its quiz. Show lesson 1 and its quiz for approval.
2) Phase B: Generate lessons 2 to 10 and their quizzes. Show lesson 10 and its quiz for approval.
3) Phase C: Generate lessons 11 to 20 and their quizzes. Show lesson 15 and its quiz for approval.
4) Phase D: Generate lessons 21 to 30 and their quizzes. Show lesson 30 and its quiz for approval.

Do not proceed to the next phase without explicit approval.

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
- Commercial: default **free** (`requiresPremium=false`); admins may change later.
- Certification: default **enabled**; admins may change later.

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

## Continuous operations (required)
- **Course repo location**: Amanoba course work lives in `/Users/moldovancsaba/Projects/amanoba_courses/`. Run course QA there.
- **Separation rule**: Keep skill development and course development strictly separate. Skill edits go only to the skills repo. Course files stay local in the course repo and are never committed.


- **After each work session**, update `SKILL.md` with any newly agreed conventions or lessons learned that improve consistency and quality.
- **Skill development location**: All skill updates and improvements must be made in the local skill repo at `/Users/moldovancsaba/Projects/skills/amanoba-course-author/`.
- **Continuously commit and push to `main`** on `origin` as changes are made to the skill or skill resources only, unless explicitly told to pause or batch commits.
- **Do not commit course content**. Course files are stored locally only and must not be added to git. The Amanoba courses repo is separate from the skill repo.

## Style rules

- Prefer bullets and steps; avoid long prose.
- Teach by doing: every concept gets a worked example and an exercise.
- Call out common mistakes explicitly.
- Use absolute dates when scheduling (e.g., 2026-02-06), not “today”.
- **One question at a time:** Ask only one question per user turn. Keep each question focused on a single topic. You may return to earlier topics in later turns if needed.
- **Never use “—” (em dash)** in any outputs.
- **Human-friendly explanations:** In each lesson, write clear, plain language explanations for the “What it is,” “What it is not,” and “2-minute theory” sections. Avoid overly terse or generic lines.

## QA scripts (required)

- Store all Amanoba course QA scripts in `/Users/moldovancsaba/Projects/skills/amanoba-course-author/scripts/`.
- Run QA scripts from the skills repo and validate content stored in `/Users/moldovancsaba/Projects/amanoba_courses/`, scoped to the specific course folder.

## Import readiness checklist (required)

Run a final import readiness check against the v2 course package JSON before declaring the course ready for UI import. At minimum verify:
- packageVersion is 2.0
- course has required fields (courseId, name, description, language, durationDays, isActive, requiresPremium, ccsId, certification)
- 30 lessons present
- each lesson has content, emailSubject, emailBody, quizConfig, quizQuestions
- each lesson has at least 7 quiz questions and each question meets minimum length rules

Store the check result in the run log and report PASS or FAIL to the user.

## Ready to import report (required)

After QA and import readiness pass, create a report file in the course folder named `ready-to-import-report.md` with:
- course name
- course folder path
- v2 package path
- date
- QA summary (lesson QA, quiz QA, import readiness)
- short notes
- next step to import in UI

## Header formatting (required)

- In lesson headers, `**One-liner:**` and `**Time:**` must each end with two spaces to force line breaks in Markdown. `**Deliverable:**` must be on its own line.

# Amanoba SSOT map (what to open, when)

Use this as a navigation index when operating as a course author/creator for amanoba.com.

## Hard rules + lesson/quiz authoring format

- `docs/amanoba_course_content_standard_v1_0.md`
  - Required lesson section order + lesson template
  - Markdown formatting constraints (headings, paragraphs, tables, callouts)
  - Quiz rules + minimum blueprint (>=7 questions/lesson) + authoring format

## End-to-end creation process + QA + smoke tests

- `docs/CREATE_A_COURSE_HANDOVER.md`
  - Resume-safe execution: run log + tasklist + process state
  - Safety rules (dry-run first, rollback plan, backups)
  - Phases: idea → outline → CCS → course → lessons → quizzes → QA → publish
  - Commands for lesson audits + quiz-quality pipeline

## Canonical system (family SSOT)

- CCS Markdown (narrative SSOT): `docs/canonical/<CCS_ID>/<CCS_ID>_CCS.md`
- Canonical JSON (machine SSOT): `docs/canonical/<CCS_ID>/<CCS_ID>.canonical.json`
  - Quality gates (lesson length, quiz cognitive mix, recallAllowed=false)
  - Lesson-level objectives + deliverables + sources

## Course package schema (export/import)

- `docs/COURSE_PACKAGE_FORMAT.md`
  - Package v2 JSON shape: `{ course, lessons, canonicalSpec? }`
  - Quiz question object shape and merge keys (`lessonId` + `uuid` preferred)
  - Import behavior: merge/upsert; do not delete existing questions/lessons

## Final export format (exemplar)

- `docs/course/SPORT_SALES_NETWORK_EUROPE_2026_EN_export_2026-02-06_RECREATED.json`
  - Treat this as the “golden” example of a publish-ready v2 course package JSON: 30 lessons, each with `content` in v1.0 lesson format and exactly 7 quiz questions per lesson.

## Practical enforcement tools

- Quiz hard rejects: `scripts/question-quality-validator.ts`
  - Strong disallows (lesson/course-referential wording, recall, vague patterns)
  - Minimum constraints (lengths, option counts, uniqueness)
- Example “enforce and regenerate” script:
  - `scripts/refactor-sport-sales-network-europe-2026-en.ts`

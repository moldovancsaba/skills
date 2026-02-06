# <Course name> — Canonical Course Spec

**Course ID (base)**: CCS_ID  
**Language**: English  
**Version**: YYYY-MM-DD  
**Canonical JSON**: `docs/canonical/CCS_ID/CCS_ID.canonical.json`

## Purpose

[One paragraph.]

## Key sections (in JSON)

- **Intent**: outcomes + explicit non-goals.
- **Quality gates**: lesson time, quiz cognitive mix, recall disallow.
- **Concepts**: [core concepts list].
- **Procedures**: [what students can do].
- **Assessment blueprint**: mid-course + final deliverables.
- **Lessons**: 30-day program (see `lessons[]` in canonical JSON).

## Delivery notes

1. **SSOT**: The canonical JSON is the machine-readable source of truth; this CCS.md is the narrative index/guide.
2. **Assessments**: Mid-course and final deliverables should be reviewed by an instructor/admin before certification.
3. **QA**: Validate quizzes with `scripts/question-quality-validator.ts` (or the quiz pipeline) and follow the smoke test steps in `docs/CREATE_A_COURSE_HANDOVER.md`.

## Next steps

- Seed/build from the canonical JSON (admin UI or scripts).
- Draft lesson content following `docs/amanoba_course_content_standard_v1_0.md`.
- Build quizzes per lesson and validate with the validator/pipeline before publish.


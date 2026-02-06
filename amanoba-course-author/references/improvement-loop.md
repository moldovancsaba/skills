# Improvement loop (course authoring skill)

## Goal

Continuously improve `amanoba-course-author` based on real student outcomes, while avoiding quality regressions.

## Cadence

- Weekly: triage new feedback, add backlog items, pick 1–3 improvements.
- Monthly: review course metrics trends and adjust templates/workflow.

## Inputs (feedback sources)

- Student Q&A / support tickets
- Quiz analytics (most-missed questions)
- Drop-off points (where students stop)
- Assignment failures (common rubric misses)
- Direct survey responses

Paste raw items into `feedback-inbox.md` using the provided format.

## Process (weekly)

1. Triage new feedback
   - Tag each item: `confusing`, `prereq-gap`, `practice-gap`, `assessment-mismatch`, `tooling`, `pacing`, `motivation`.
2. Convert to backlog items
   - One feedback cluster -> one backlog item with a measurable success metric.
3. Pick 1–3 items to implement
   - Prefer high-frequency issues and blockers to “nice-to-haves”.
4. Implement the change
   - Update SKILL.md guidance and/or `assets/` templates.
   - If needed, add a new template section, rubric criterion, or “common mistakes” snippet.
5. Run quality gates
   - Re-run `references/regression-prompts.md` against the updated skill (mental run or actual usage).
   - Ensure outcomes ↔ practice ↔ assessment alignment still holds.
6. Record the release
   - Add a short entry at the top of `improvements-backlog.md` (“Released on YYYY-MM-DD: ...”).

## Quality gates (non-negotiable)

- Every learning outcome has at least:
  - One worked example
  - One guided practice
  - One assessed checkpoint or rubric criterion
- No hidden prerequisites: anything required is stated in prerequisites + diagnostic.
- Student support includes “getting unstuck” guidance (what to provide in help requests).


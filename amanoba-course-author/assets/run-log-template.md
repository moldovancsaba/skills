# Run Log — <COURSE_ID or CCS_ID> — <short title>

- Started (UTC): <timestamp>
- Environment: <production|staging> (env file: <.env.local|...>)
- Scope: <CCS_ID / COURSE_ID(s) / languages>

## Safety Rollback Plan

- Lesson restore: `npx tsx --env-file=.env.local scripts/restore-lesson-from-backup.ts --file scripts/lesson-backups/<COURSE_ID>/<LESSON_ID__TIMESTAMP>.json`
- Quiz restore: `npx tsx --env-file=.env.local scripts/restore-lesson-quiz-from-backup.ts --file scripts/quiz-backups/<COURSE_ID>/<LESSON_ID__TIMESTAMP>.json`

## Outputs

- Reports: <paths>
- Backups: <paths>

## Process State

- Status: **RUNNING**
- Tasklist: `docs/_archive/tasklists/<MATCHING_TASKLIST>.md`
- Current phase: <A/B/C/...>
- Last completed step: <what>
- Next step: <what>
- Next command: `<exact command>`
- Blockers: <none|...>


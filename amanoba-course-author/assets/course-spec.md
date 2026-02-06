# Course spec (Amanoba SSOT)

## Course title

## Identifiers (required)

- CCS_ID (family): `CCS_ID` (UPPERCASE_UNDERSCORE)
- COURSE_ID (language variant): `CCS_ID_EN` (or `_HU`, `_PT_BR`, etc.)
- Language: `en` (lowercase locale)

## Target student

- Who this is for:
- Who this is not for:

## Student targets (real-world outcomes)

- Target 1:
- Target 2:

## Prerequisites

- Required:
- Recommended:
- Prereq diagnostic (5–10 questions/tasks):

## Learning outcomes (measurable)

1.
2.

For each outcome, add:
- Evidence of mastery:
- Common failure modes:
- Practice opportunities:

## Course structure

- Duration: 30 days (default)
- Lessons: Day 1–30, 1 lesson/day
- Lesson time budget: 20–30 minutes
- Modules (optional grouping for humans; lessons are still day-based in the platform):
  - Module 1: [name + 1-line goal]

## Assessments

- Capstone deliverable(s) (end of course):
  - Brief:
  - Deliverables:
  - Grading rubric:
- Checkpoints (recommended): [which days], each with a rubric

## Student support

- Setup guide:
- Troubleshooting guide:
- FAQ:
- Study plan:
- Office hours / feedback loop:

## Platform/publishing notes (amanoba.com)

- File formats:
- Media needs:
- Accessibility:

## QA gates (must pass)

- Lessons follow `amanoba_course_content_standard_v1_0.md` format (section order, 5W1H, deliverable, success criteria).
- Quiz pool per lesson: >= 7; 0 recall; >= 5 application; standalone wording; 1 correct answer.
- Export/import package matches `docs/COURSE_PACKAGE_FORMAT.md` (packageVersion 2.0).

*** Add File: codex_skills/amanoba-course-author/assets/course-package.v2.template.json
{
  "packageVersion": "2.0",
  "exportedAt": "2026-02-06T00:00:00.000Z",
  "exportedBy": "codex",
  "course": {
    "courseId": "CCS_ID_EN",
    "name": "Course Name",
    "description": "Public description (markdown-safe plain text).",
    "language": "en",
    "durationDays": 30,
    "isActive": false,
    "requiresPremium": false,
    "ccsId": "CCS_ID",
    "quizMaxWrongAllowed": 0
  },
  "lessons": [
    {
      "lessonId": "CCS_ID_EN_DAY_01",
      "dayNumber": 1,
      "language": "en",
      "title": "Lesson 1 Title",
      "content": "# Lesson 1: Title\n\n**One-liner:** ...\n",
      "emailSubject": "Day 1 — Lesson title",
      "emailBody": "## Today\n\nRead the lesson in the app.",
      "quizConfig": {
        "enabled": true,
        "required": true,
        "questionCount": 5,
        "poolSize": 7,
        "successThreshold": 80
      },
      "quizQuestions": [
        {
          "uuid": "00000000-0000-0000-0000-000000000000",
          "question": "Standalone scenario question (>= 40 chars).",
          "options": [
            "Correct option (>= 25 chars).",
            "Plausible wrong option 1 (>= 25 chars).",
            "Plausible wrong option 2 (>= 25 chars).",
            "Plausible wrong option 3 (>= 25 chars)."
          ],
          "correctIndex": 0,
          "difficulty": "MEDIUM",
          "category": "Course Specific",
          "questionType": "application",
          "hashtags": [
            "#topic-example",
            "#difficulty-medium",
            "#type-application"
          ],
          "isActive": true
        }
      ]
    }
  ],
  "canonicalSpec": null,
  "courseIdea": null
}


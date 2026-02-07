# Localization Workflow

Use this when the user wants course content in other languages or wants help selecting the next target language.

## Inputs to confirm

- Source course folder and language
- Target language candidates or a single chosen language
- Localization type: strict translation or culturally adapted
- Any regional constraints or compliance needs

## Research and decision workflow

1. Collect external demand signals for each candidate language. Use `web.run` and cite sources.
2. Summarize tradeoffs in a short comparison table or bullets.
3. Recommend one language with clear reasoning.
4. Ask the user to pick a target language before any content work.

## Required localization artifacts

Store all localization artifacts inside `<course-folder>/localization/`:

- `language-demand-research.md`
- `target-language-decision.md`
- `localization-brief.md`
- `glossary-<lang>.md`
- `style-guide-<lang>.md`
- `cultural-adaptation-checklist.md`
- `localization-qa-report.md`

## Production notes

- Create a new course folder for each language variant.
- Keep the same `ccsId` family and create a new `courseId` with the language token.
- Enforce glossary and style guide rules before QA.
- All course content must still follow the v1.0 lesson and quiz rules.

# Operator Content Health Dashboard

Status: implemented in `0.17.4`.

## Access

The dashboard is available at:

- `/operator/content-health`

Access is limited to:

- `moldovancsaba@gmail.com`
- `SUPERADMIN` users for recovery/admin support

The normal Webapp proxy still requires a valid logged-in session. The sidebar shows a `System Activity` link only for the requested operator email.

## Purpose

This dashboard gives a fast hourly health signal for whether CHECK Local and the Webapp are actually creating and improving useful content.

It has two stacked bar charts:

- `New Created Content`: newly created content/cards by family.
- `Updated Cards And Feedback`: post-creation card touches plus feedback, actions, corrections, comments/interactions, decisions, and outcomes.

## Data Contract

API:

- `GET /api/operator/content-health?hours=24`

Query params:

- `hours`: 1 to 168, default 24.
- `timezone`: optional, default `Europe/Budapest`. Invalid timezone input falls back to `Europe/Budapest`.

Response:

- `dashboard.range`: start, end, hours, timezone.
- `dashboard.created`: total, hourly buckets, source totals.
- `dashboard.updated`: total, hourly buckets, source totals.
- `dashboard.recentSamples`: latest cards/outcomes for quick inspection.

## Included Sources

Created activity includes:

- Datacards
- Uploaded files
- Flashcards
- Goals
- Tasks
- Opportunities
- Board cards
- Destination candidates
- Destination drafts
- Review packets

Updated/activity signal includes:

- Post-creation updates to Datacards, Files, Flashcards, Goals, Tasks, Opportunities, and Board cards
- Task, strategic, and opportunity feedback
- Flashcard and Goal actions
- Flashcard and Goal corrections
- Hashtag feedback
- Interaction, decision, and outcome audit events

## Operational Notes

- Aggregation runs server-side against Atlas with hourly `$dateTrunc` buckets.
- Each Atlas aggregation command has a `10s` `maxTimeMS` bound so the dashboard cannot pin the database indefinitely.
- Raw Mongo commands use extended JSON date literals because Prisma `$runCommandRaw` does not serialize JavaScript `Date` values as Mongo dates.
- API responses use `Cache-Control: no-store`; the dashboard should always reflect current operational health.
- The frontend refreshes every 60 seconds and renders only GDS primitives/charts.
- Browser users see current totals, active-hour counts, top source families, and recent samples.

## Verification

Required checks:

- `npm run test:operator-content-health-contract`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

# Operator Content Health Dashboard

Status: implemented and scheduled in `0.17.7`.

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

It also persists hourly snapshots and evaluates whether the current operating hour is normal against recent baseline history.

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
- `dashboard.health`: operator status, anomalies, same-hour baseline trend, and alert-ready payload.
- `dashboard.snapshots`: snapshot write metadata and retention information.

Background refresh:

- `GET /api/cron/operator-content-health`
- Requires the normal background bearer secret (`CRON_SECRET`, falling back to `INGEST_SECRET`).
- Scheduled in `vercel.json` as `0 * * * *` so production refreshes hourly.
- Defaults to the full bounded 168-hour window so baseline data keeps learning even when the operator page is not open.
- Classified as a `SYSTEM_HEALTH` runnable because it mutates only runtime health telemetry, not business or public content.

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
- Hourly dashboard buckets are upserted into `OperatorContentHealthSnapshot`.
- Snapshot retention is 30 days.
- Health evaluation uses the last completed hour, same-hour-yesterday data when present, and the available 7-day same-local-hour average.
- Alert payloads are returned under `dashboard.health.alert` and are ready for future Slack/email routing.
- Each Atlas aggregation command has a `10s` `maxTimeMS` bound so the dashboard cannot pin the database indefinitely.
- Raw Mongo commands use extended JSON date literals because Prisma `$runCommandRaw` does not serialize JavaScript `Date` values as Mongo dates.
- API responses use `Cache-Control: no-store`; the dashboard should always reflect current operational health.
- The frontend refreshes every 60 seconds and renders only GDS primitives/charts.
- Browser users see current totals, active-hour counts, operator health, anomaly rows, baseline trend, top source families, and recent samples.

## Verification

Required checks:

- `npm run test:operator-content-health-contract`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- signed-session API smoke for `/api/operator/content-health`
- background-secret API smoke for `/api/cron/operator-content-health`

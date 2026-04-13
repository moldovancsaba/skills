# Checklist Onboarding

This file documents the current operating surface of the Checklist system.

Do not place production credentials in this file.

Current release:

- `v0.10.0`

## Canonical Environments

- production: `https://checklist.sovereignsquad.com`
- local development: `http://localhost:3000`

If another preview domain exists, treat it as non-canonical unless explicitly documented in deployment notes.

## Current Route Structure

### Core product flow

- `/`
- `/[companyId]`
- `/[companyId]/data`
- `/[companyId]/topics`
- `/[companyId]/knowmore`
- `/[companyId]/nba`
- `/[companyId]/nba_archived`
- `/[companyId]/settings`

### Supporting routes

- `/auth`
- `/login`
- `/manual`
- `/faq`
- `/privacy`
- `/terms`

The app is company-route based. It does not use the old `?company=UUID` query-string model as the primary navigation contract.

## Data Model Summary

- `Company`
- `Source`
- `UploadedSourceFile`
- `Topic`
- `Flashcard`
- `FlashcardSource`
- `FlashcardAction`
- `HashtagFeedback`
- `NBAItem`
- `Feedback`
- `PublicIdCounter`

All user-facing entities use:

- internal `UUID`
- stable readable `publicId` where implemented

## Flashcards vs Tasks

This distinction is critical:

- `Data page`
  - raw ingested source records
- `Knowmore`
  - processed flashcards
  - uses `confidence`, `impact`, `weight`
- `NBA / My Tasks`
  - actionable checklist items
  - uses `impact`, `confidence`, `ease`, `ICE`

## Current API Endpoints

### Auth

```text
GET /api/auth/login
GET /api/auth/callback
GET /api/auth/logout
GET /api/auth/session
```

### Companies

```text
GET    /api/companies
POST   /api/companies
PATCH  /api/companies?id=<company-id>
DELETE /api/companies?id=<company-id>
```

### Raw source records

```text
GET    /api/sources?companyId=<company-id>
POST   /api/sources
PATCH  /api/sources?id=<source-id>
DELETE /api/sources?id=<source-id>

GET    /api/data-files?companyId=<company-id>
POST   /api/data-files
PATCH  /api/data-files?id=<file-id>
DELETE /api/data-files?id=<file-id>
```

### Topics and hashtags

```text
GET    /api/topics?companyId=<company-id>
POST   /api/topics
PATCH  /api/topics?id=<topic-id>
DELETE /api/topics?id=<topic-id>

GET    /api/hashtags/recommendations?companyId=<company-id>
POST   /api/hashtags/feedback
```

### Knowmore

```text
GET  /api/knowmore?companyId=<company-id>
POST /api/knowmore/sync
POST /api/knowmore/actions
GET  /api/knowmore/corrections?companyId=<company-id>
POST /api/knowmore/corrections
```

`/api/knowmore/actions` supports:

- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

Declined flashcards are hidden from the main Knowmore feed.

`/api/knowmore/corrections` supports direct correction events such as:

- `HIDE`
- `MARK_WRONG`
- `PIN`
- `REQUEST_REFRESH`
- `SUPPRESS_SOURCE`

### NBA / tasks

```text
GET  /api/nba?companyId=<company-id>
POST /api/nba

GET  /api/feedback
POST /api/feedback

GET  /api/feedback/analytics?companyId=<company-id>
```

`/api/feedback` supports task actions:

- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

### Communication & Alerting

```text
GET  /api/communication/settings?companyId=<companyId>
POST /api/communication/settings
POST /api/bridge/ingress (Two-Way Bridge)
```

### Local AI bridge

```text
POST /api/agent/local
GET  /api/webhook/trigger
POST /api/webhook/trigger
```

These endpoints are passive in the hosted app. They do not contact your local AI worker. The local worker must poll the shared Checklist database on its own.

## ICE Scoring Contract

Checklist task scoring is:

```text
Impact: 0-10
Confidence: 0-100, multiplied as confidence/10
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

Examples:

- `Impact 8, Confidence 75, Ease 6.5` -> `390`
- `Impact 8, Confidence 85, Ease 5` -> `340`
- `Impact 10, Confidence 100, Ease 10` -> `1000`

## Auth Setup

Authentication is environment-configured SSO with a PKCE-style flow.

Minimum auth/session variables:

- `APP_SESSION_SECRET`
- `SSO_CLIENT_ID`
- `SSO_CLIENT_SECRET`
- `SSO_AUTH_URL`
- `SSO_TOKEN_URL`
- `SSO_REDIRECT_URI`
- `SSO_SCOPES`
- `NEXT_PUBLIC_BASE_URL`

Do not hardcode provider-specific setup notes here unless the deployed system is intentionally locked to one provider and the callback URLs have been verified.

## Local AI Responsibilities

The local system is responsible for:

- source enrichment
- topic-guided research focus
- page fetching
- public signal collection
- flashcard generation
- supporting checklist generation

The online app is responsible for:

- source CRUD
- displaying flashcards
- displaying NBA tasks
- collecting user feedback
- exposing release and session metadata

## Database Setup On A New Machine

Checklist owns its Prisma schema in this repo:

- `prisma/schema.prisma`

The app and any local AI worker both use:

- `DATABASE_URL`

If you are bringing the project up on another machine:

1. add the Checklist `DATABASE_URL` and auth envs to local `.env`
2. run `npm install`
3. run `npx prisma generate`
4. run `npx prisma db push`
5. start the app with `npm run dev`

If a local AI worker is involved, give that process the same Checklist `DATABASE_URL`, `OLLAMA_MODEL`, and either `OLLAMA_HOST` or `OLLAMA_URL`. The worker defaults to port `10005` for its own local HTTP status/process surface, but the hosted webapp must not call it directly.

## Documentation Rule

If this file drifts again, update it together with:

- `README.md`
- `SPEC.md`
- `docs/LOCAL_AI_PIPELINE.md`
- route changes
- API changes
- auth changes
- Prisma schema changes

# Checklist Onboarding

This file documents the current, real integration surface of the Checklist system.

Do not place production credentials in this file.

## Production URL

- `https://checklist.messmass.com`

## Current route structure

- `https://checklist.messmass.com/`
- `https://checklist.messmass.com/[companyId]`
- `https://checklist.messmass.com/[companyId]/data`
- `https://checklist.messmass.com/[companyId]/knowmore`
- `https://checklist.messmass.com/[companyId]/nba`

The app is company-route based. It is not using the old `?company=UUID` query-string routing model as the primary navigation contract.

## Data model summary

- `Company`
- `Product`
- `Customer`
- `Competitor`
- `Flashcard`
- `FlashcardSource`
- `FlashcardAction`
- `NBAItem`
- `Feedback`
- `PublicIdCounter`

All user-facing entities use:
- internal `UUID`
- stable readable `publicId` where implemented

## Flashcards vs tasks

This distinction is critical:

- `Data page`
  - raw ingested source records
- `Knowmore`
  - processed flashcards
  - uses `confidence`, `impact`, `weight`
- `NBA / My Tasks`
  - actionable checklist items
  - uses `impact`, `confidence`, `ease`, `ICE`

## Current API endpoints

### Companies

```text
GET    /api/companies
POST   /api/companies
PATCH  /api/companies?id=<company-id>
DELETE /api/companies?id=<company-id>
```

### Raw source records

```text
GET    /api/products?companyId=<company-id>
POST   /api/products
PATCH  /api/products?id=<product-id>
DELETE /api/products?id=<product-id>

GET    /api/customers?companyId=<company-id>
POST   /api/customers
PATCH  /api/customers?id=<customer-id>
DELETE /api/customers?id=<customer-id>

GET    /api/competitors?companyId=<company-id>
POST   /api/competitors
PATCH  /api/competitors?id=<competitor-id>
DELETE /api/competitors?id=<competitor-id>
```

### Knowmore

```text
GET  /api/knowmore?companyId=<company-id>
POST /api/knowmore/sync
POST /api/knowmore/actions
```

`/api/knowmore/actions` supports:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

Declined flashcards are hidden from the webapp feed.

### NBA / tasks

```text
GET  /api/nba?companyId=<company-id>
POST /api/nba

GET  /api/feedback
POST /api/feedback
```

`/api/feedback` now supports task actions:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

## ICE scoring contract

Checklist task scoring is:

```text
Impact: 0-10
Confidence: 0-100, but multiplied as confidence/10
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

Examples:

- `Impact 8, Confidence 75%, Ease 6.5` -> `390`
- `Impact 8, Confidence 85%, Ease 5` -> `340`
- `Impact 10, Confidence 100%, Ease 10` -> `1000`

## Local AI responsibilities

The local system is responsible for:

- source enrichment
- page fetching
- public signal collection
- flashcard generation
- supporting NBA generation

The online app is responsible for:

- source CRUD
- displaying flashcards
- displaying NBA tasks
- collecting user feedback

## Environment handling

Secrets are intentionally not documented here.

Use:
- local `.env`
- Vercel project env management
- local control-plane env injection for the local AI stack

Minimum categories of required env:

- database
- session/auth
- local model access
- local sync bridge

## Documentation rule

If this file drifts again, update it together with:

- `README.md`
- `docs/LOCAL_AI_PIPELINE.md`
- Prisma schema changes
- API behavior changes
- routing changes

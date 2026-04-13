# Checklist Product and System Specification

## Current Status

Checklist is an active production web application with local-AI-assisted enrichment and recommendation generation.

Current release baseline:

- app version: `v0.10.0`
- framework: `Next.js 16.2.2`
- product title: `Checklist Marketing OS`
- canonical production URL: `https://checklist.sovereignsquad.com`

## Product Definition

Checklist is a marketing operating system that separates:

1. `DATA`
   - raw source records entered by users
   - products, customers, competitors, uploaded files
2. `KNOWMORE`
   - processed flashcards derived from raw evidence and enrichment
3. `NBA`
   - ranked next-best-action checklist items derived from company context and flashcards

The system is designed so the online app remains usable even when the local AI layer is delayed or unavailable.

## Current User-Facing Routes

### Core workflow

| Path | Description |
|------|-------------|
| `/` | company selection and company CRUD |
| `/[companyId]` | company dashboard |
| `/[companyId]/data` | raw source ingestion |
| `/[companyId]/knowmore` | flashcard review and knowledge layer |
| `/[companyId]/nba` | pending next-best-action checklist |
| `/[companyId]/nba_archived` | archived checklist items |
| `/[companyId]/topics` | topic prioritization for AI research |
| `/[companyId]/settings` | communication and bridge settings |

### Supporting routes

| Path | Description |
|------|-------------|
| `/auth` | auth landing page |
| `/manual` | operator manual |
| `/faq` | FAQ |
| `/privacy` | privacy policy |
| `/terms` | terms |
| `/brand` | brand page |
| `/products` | global products page |
| `/customers` | global customers page |
| `/competitors` | global competitors page |
| `/data` | global data page |
| `/content` | content page |
| `/crm` | CRM page |
| `/intelligence` | intelligence page |
| `/leads` | leads page |
| `/portfolio` | portfolio page |
| `/strategy` | strategy page |
| `/pre-fortitude` | pre-fortitude page |

## Architecture

```text
Online webapp (Vercel)
- Next.js 16 app router
- Prisma + Neon Postgres
- user-facing CRUD, review, and navigation
- auth and session handling

Shared persistence
- companies
- source records
- uploaded files
- flashcards, flashcard actions, and provenance
- NBA items and feedback
- public ID counters

Local AI layer
- Ollama-backed reasoning
- URL/content enrichment
- flashcard generation and refresh
- NBA suggestion generation
- optional sync bridge via webhook/local endpoint
```

## Current Tech Stack

- Frontend: `Next.js 16.2.2`, `React 18`, `Tailwind`, `shadcn-ui`
- Database: `MongoDB Atlas` via `Prisma`
- Local AI: `Ollama`
- Auth: environment-configured OAuth/OIDC-style SSO with PKCE support

## Core Behaviors

### Company and source management

- companies are created and selected from `/`
- raw source records are stored as products, customers, competitors, and uploaded files
- source creation and edits trigger knowledge sync flows

### Knowmore

- flashcards are shown on `/:companyId/knowmore`
- flashcards carry confidence, impact, weight, provenance, and review state
- review actions:
  - `ACCEPT`
  - `DECLINE`
  - `MODIFY_ACCEPT`

### NBA

- checklist tasks are shown on `/:companyId/nba`
- tasks carry impact, confidence, ease, and ICE score
- task review actions:
  - `ACCEPT`
  - `DECLINE`
  - `MODIFY_ACCEPT`
- task feedback can propagate back to source flashcards

### ICE contract

```text
Impact: 0-10
Confidence: 0-100
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

## Current API Surface

### Auth

- `/api/auth/login`
- `/api/auth/callback`
- `/api/auth/logout`
- `/api/auth/session`

### Domain APIs

- `/api/topics`
- `/api/hashtags/recommendations`
- `/api/hashtags/feedback`
- `/api/knowmore`
- `/api/knowmore/actions`
- `/api/knowmore/sync`
- `/api/knowmore/corrections`
- `/api/nba`
- `/api/feedback`
- `/api/feedback/analytics`
- `/api/communication/settings`
- `/api/bridge/ingress`
- `/api/release`

### Local AI bridge

- `/api/agent/local`
- `/api/webhook/trigger`

## Authentication Contract

Authentication is environment-driven.

The app expects:

- `APP_SESSION_SECRET`
- `SSO_CLIENT_ID`
- `SSO_CLIENT_SECRET`
- `SSO_AUTH_URL`
- `SSO_TOKEN_URL`
- `SSO_REDIRECT_URI`
- `SSO_SCOPES`
- `NEXT_PUBLIC_BASE_URL`

Docs should not hardcode a provider name unless the deployed environment is explicitly standardized on one provider and all callback/base URLs have been updated to match.

## Design-System Rule

Checklist should use shared page-shell, form, card, and action primitives rather than route-local styling patterns.

The authoritative UI rules belong in:

- `DESIGN_SYSTEM.md`

## Operational Rule

When any of these change, update docs in the same change set:

- routes
- auth behavior
- API surface
- database contract
- online/local workflow
- design-system grammar

## Document Status

Status: current
Last updated: `2026-04-13`

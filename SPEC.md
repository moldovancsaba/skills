# Checklist Product and System Specification

## Current Status

Checklist is an active production web application with local-AI-assisted enrichment and recommendation generation.

Current release baseline:

- app version: `v0.12.0`
- framework: `Next.js 16.2.2`
- product title: `Checklist Marketing OS`
- canonical production URL: `https://checklist.sovereignsquad.com`
- local AI version: `Sovereign Trinity v0.12.0`

## Product Definition

Checklist is a marketing operating system that separates:

1. `DATA`
   - raw source records entered by users
   - products, customers, competitors, uploaded files
2. `TOPICS`
   - strategic priorities that dictate AI orchestration
3. `REVIEW`
   - circuit breaking manual intervention dashboard for uncalculatable AI intelligence
4. `KNOWMORE`
   - processed flashcards derived from raw evidence and enrichment
5. `TASKCARDS` (NBA)
   - ranked next-best-action checklist items derived from company context and flashcards
   - deduplicated via deterministic fingerprinting

The system is designed so the online app remains usable even when the local AI layer is delayed or unavailable.

## Current User-Facing Routes

### Core workflow

| Path | Description |
|------|-------------|
| `/` | company selection and company CRUD |
| `/[companyId]` | company dashboard |
| `/[companyId]/data` | raw source ingestion |
| `/[companyId]/topics` | topic prioritization for AI research |
| `/[companyId]/review` | manual loop for uncalculatable AI outputs |
| `/[companyId]/knowmore` | flashcard review and knowledge layer |
| `/[companyId]/nba` | pending next-best-action checklist |

### Supporting routes

| Path | Description |
|------|-------------|
| `/auth` | auth landing page |
| `/manual` | operator manual |
| `/faq` | FAQ |
| `/privacy` | privacy policy |

## Architecture

```text
Online webapp (Vercel)
- Next.js 16 app router
- Prisma + MongoDB Atlas
- **Passive Ingress**: UI captures user 'Intent' (title/description).
- **Axiomatic Enforcement**: Core interface color layers strictly bound to 1-10 thresholds.

Shared persistence (MongoDB Atlas)
- The 'Bridge' between Human Reality and AI Strategy.
- Decoupled Command and Control: Worker health and status stored in GlobalSettings table.

Local AI Layer (The Trinity - Authoritative Engine)
- **Authoritative Source**: Performs all scoring (ICE), bounded to strict 1-10 integers.
- Drafter: Extracts insights from raw sources into FlashCard drafts. Reroutes logic failures to REVIEW state.
- Writer: Refines FlashCards and TaskCards (Calculating ICE Impact * Confidence * Ease).
- Judge: Audits quality against a statistical percentile floor. Unsalvageable cards cratered to 1 score.
- Defibrillator Hook: Local worker heartbeat can be forcefully reset via API ping to MongoDB.
```

## Current Tech Stack

- Frontend: `Next.js 16.2.2`, `React 18`, `Tailwind`, `shadcn-ui`
- Database: `MongoDB Atlas` via `Prisma`
- Local AI: `Ollama`
- Auth: environment-configured OAuth/OIDC-style SSO with PKCE support

## Core Behaviors

### Quality floor & Axiom Bounds

All parameters (Impact, Confidence, Ease, Weight) exist strictly on a `1 to 10` boundary. The ICE score formula is directly computed (`I * C * E`), expanding to bounds of `1 to 1000`. Feedback interactions provide a direct `+1/-1` metric impact.

The Judge demotes any card falling below the `confidence_reject_percentile` (default: 10th percentile) of current verified intelligence. Rejected cards are returned to `DRAFT` status and their metrics are forcefully reset to `1`.

### Deduplication
- Flashcards: `EVO:FC:[company]:[source]:[title]`
- TaskCards: `EVO:TC:[company]:[flashcard]:[title]`

## Operational Rule

When any of these change, update docs in the same change set:

- routes
- auth behavior
- API surface
- database contract
- online/local workflow
- design-system grammar

## Document Status

Status: current (v0.12.0)
Last updated: `2026-04-16`

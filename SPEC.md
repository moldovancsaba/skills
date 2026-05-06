# Checklist Product and System Specification

## Current Status

Checklist is an active production web application with local-AI-assisted enrichment and recommendation generation.

Checklist release baseline:

- app version: `v0.15.0`
- framework: `Next.js 16.2.2 (Turbopack)`
- product title: `CHECKLIST`
- canonical production URL: `https://checklist.sovereignsquad.com`
- local AI version: `CHECKLIST Trinity v0.15.0`

## Product Definition

Checklist is a strategic intelligence operating system that separates:

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
| `/` | Global Portfolio |
| `/[companyId]` | Dashboard |
| `/[companyId]/data` | Data Ingress |
| `/[companyId]/topics` | Topic Synthesis |
| `/[companyId]/review` | Review Gateway |
| `/[companyId]/knowmore` | Knowmore |
| `/[companyId]/goals` | Strategic Goals |
| `/[companyId]/nba` | Checklist |
| `/[companyId]/tactical` | Tactical Board |
| `/[companyId]/settings` | Organization Settings |

### Supporting routes

| Path | Description |
|------|-------------|
| `/auth` | auth landing page |
| `/manual` | operator manual |
| `/faq` | FAQ |
| `/privacy` | privacy policy |

## Design System & UI Architecture (Hardened)

The system enforces a strict **Mantine-First** architectural mandate to ensure visual premium and build-time stability.

1. **Mantine-Native Primitives**
   - 100% of UI layout must be constructed using native Mantine components (`Stack`, `Group`, `Grid`, `SimpleGrid`).
   - Manual Tailwind utility classes are strictly prohibited to prevent architectural entropy.
2. **Unified Page Architecture**
   - Every primary intelligence layer must use the `PageShell` and shared grid wrappers.
   - Layouts must be viewport-aware and responsive by design.
   - Company overview and Operation Unit route-card strips must use the shared `RouteCardGrid` contract for a 6-column desktop layout.
3. **Intelligence Clarity (Metadata Purge)**
   - All user-facing intelligence (Titles, Descriptions, Labels) must be processed via the `stripTechnicalMetadata()` utility.
   - Technical markers like `[TRACE:...]` or `[TOPIC_ID:...]` are strictly internal and must never be rendered in the presentation layer.

## Architecture

```text
Online webapp (Vercel)
- Next.js 16 app router
- Prisma + MongoDB Atlas
- **Mantine-First UI**: Standardized on Mantine 7 primitives.
- **Axiomatic Enforcement**: Core interface color layers strictly bound to 1-10 thresholds.
- **Metadata Filtering**: Hardened presentation layer for pure intelligence visibility.

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

- Frontend: `Next.js 16.2.2`, `React 18`, `Mantine 7`
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
- design-system grammar (Mantine-First Mandate)
- metadata filtering standards

## Document Status

Status: current (v0.15.0)
Last updated: `2026-05-05`

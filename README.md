# Checklist

Checklist is a split-system marketing operating system:

- the `online webapp` runs on Vercel and is the user-facing product
- the `local AI layer` enriches source evidence, generates flashcards, researches active topics, and supports checklist generation
- MongoDB Atlas via Prisma is the shared system of record

Current app version:
- `v0.8.0`

Canonical production URL:
- `https://checklist.sovereignsquad.com`

Key decision records:
- `docs/SCHEDULER_FAIRNESS_DECISION_RECORD.md` - fairness, anti-starvation, and restart-order contract for the local AI worker
- `docs/SCHEDULER_CURSOR_RUNTIME.md` - shipped persistent company cursor and restart-safe scheduler runtime behavior

## Current architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Online webapp (Vercel)                                    │
│ https://checklist.sovereignsquad.com                      │
│ - Next.js 16 app router                                   │
│ - source data entry                                       │
│ - Knowmore flashcards                                     │
│ - NBA checklist tasks                                     │
│ - auth, feedback, and release metadata                    │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ writes / reads
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Shared database (MongoDB Atlas via Prisma)                │
│ - companies + memberships                                 │
│ - unified sources + uploaded source files                 │
│ - topics + hashtag feedback                               │
│ - flashcards + flashcard actions                          │
│ - checklist items + feedback                              │
│ - public ID counters                                      │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ enrichment / generation
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Local AI layer                                             │
│ - local URL fetch + public signal collection               │
│ - local model reasoning via Ollama                         │
│ - flashcard generation / refresh                           │
│ - NBA generation support                                   │
│ - optional webhook-triggered sync bridge                   │
└────────────────────────────────────────────────────────────┘
```

## Product model

Checklist follows a 4-step operator pipeline:

1. `DATA`
   - raw user-ingested `Source` rows and uploaded files
   - hashtagged and entity-tagged evidence
   - the hosted app writes these rows directly to the shared database
2. `TOPICS`
   - manually prioritized research focus areas
   - active/inactive and user-ordered
   - used by the local AI worker to decide what to research and emphasize
3. `FLASHCARDS`
   - processed knowledge atoms shown on `/:companyId/knowmore`
   - derived from source evidence and public signals
   - carry `confidence`, `impact`, `weight`, provenance, and review state
4. `TASKS`
   - checklist items shown on `/:companyId/nba`
   - generated from flashcards and company context
   - carry `impact`, `confidence`, `ease`, and `ICE`

## Current route structure

### Company-scoped routes

| Route | Purpose |
|---|---|
| `/[companyId]` | company dashboard |
| `/[companyId]/data` | raw source data entry |
| `/[companyId]/topics` | topic prioritization for local AI research |
| `/[companyId]/knowmore` | flashcards / knowledge layer |
| `/[companyId]/nba` | checklist tasks / next best actions |
| `/[companyId]/nba_archived` | archived checklist items |

### Global routes

| Route | Purpose |
|---|---|
| `/` | company selection / company CRUD |
| `/login` | login page |
| `/auth` | auth landing page |
| `/manual` | redirects to FAQ |
| `/faq` | frequently asked questions |
| `/privacy` | privacy policy |
| `/terms` | terms |
| `/brand` | brand page |
| `/products` | global products view |
| `/customers` | global customers view |
| `/competitors` | global competitors view |
| `/data` | global data view |
| `/content` | content page |
| `/crm` | CRM page |
| `/intelligence` | intelligence page |
| `/leads` | leads page |
| `/portfolio` | portfolio page |
| `/strategy` | strategy page |
| `/pre-fortitude` | pre-fortitude page |

## Current core behaviors

- `public IDs`
  - user-facing source records, flashcards, and checklist items use readable integer IDs in addition to UUIDs
- `Knowmore flashcards`
  - kinds include `SUMMARY`, `EXPLANATION`, `COMPARISON`, `NEWS`, `CONCLUSION`, `EVALUATION`, `OPINION`, `JUDGMENT`, `RECOMMENDATION`, `RESEARCH`, `FORECAST`, `STOCK`, `GOSSIP`, `PRICE`
- `flashcard review actions`
  - `Accept`
  - `Decline`
  - `Modify + accept`
- `NBA task review actions`
  - `Accept`
  - `Decline`
  - `Modify + accept`
- `feedback loop`
  - flashcard feedback changes flashcard scoring
  - task feedback changes the source flashcards tied to that task
  - **weighted annotation learning**: user actions (accept/decline/modify) calculate term and hashtag weights used to score and suppress future candidates
- `continuous improvement direction`
  - the next planned system layer selects stale flashcards and tasks by oldest meaningful modification time
  - improvement work is ranked by business value before bounded research is spent
  - the implementation contract is documented in `docs/CONTINUOUS_IMPROVEMENT_PLAN.md`
- `ICE scoring`
  - `Impact: 0-10`
  - `Confidence: 0-100`
  - `Ease: 0-10`
  - formula: `impact * (confidence / 10) * ease`
  - output range: `0-1000`

## Tech stack

- `Next.js 16.2.2`
- `React 18`
- `Prisma + MongoDB Atlas`
- `Tailwind + shadcn-ui`
- `Ollama` for local model execution

## Development

Install:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Useful commands:

```bash
npm run lint
npm run build
npm run db:generate
npm run db:push
npm run repair:raw-sources
```

Operational references:
- `docs/LOCAL_AI_PIPELINE.md`
- `docs/SCHEDULER_FAIRNESS_DECISION_RECORD.md`
- `docs/SCHEDULER_CURSOR_RUNTIME.md`

## Environment

Required environment variables are local-only secrets and must not be committed to docs or source control.

At minimum, this app expects:

- `DATABASE_URL`
- `APP_SESSION_SECRET`
- `SSO_CLIENT_ID`
- `SSO_CLIENT_SECRET`
- `SSO_AUTH_URL`
- `SSO_TOKEN_URL`
- `SSO_REDIRECT_URI`
- `SSO_SCOPES`
- `NEXT_PUBLIC_BASE_URL`
- local AI / sync envs where applicable:
  - `OLLAMA_URL`
  - `OLLAMA_HOST` (preferred worker alias; falls back to `OLLAMA_URL`)
  - `OLLAMA_MODEL`

Use local `.env` and Vercel project env management. Do not place real credentials in documentation.

## Database contract

There is a single Checklist database schema for this product:

- Prisma schema path: `prisma/schema.prisma`
- Prisma datasource env: `DATABASE_URL`

If you run a local AI worker on another machine, it must connect to the same Checklist MongoDB database by using the same Checklist `DATABASE_URL`.

Important:

- there is no second Checklist Prisma schema inside another app
- if setup fails on a new machine, treat it as a missing Checklist database connection or missing `prisma db push`, not as a bad path to another app's schema

## Main API routes

### Auth

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/login` | `GET` | start OAuth login |
| `/api/auth/callback` | `GET` | auth callback |
| `/api/auth/logout` | `GET` | clear session |
| `/api/auth/session` | `GET` | current session state |

### Core app data

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/companies` | `GET, POST, PATCH, DELETE` | company CRUD |
| `/api/sources` | `GET, POST, PATCH, DELETE` | unified raw source CRUD |
| `/api/data-files` | `GET, POST, PATCH, DELETE` | uploaded source files |
| `/api/topics` | `GET, POST, PATCH, DELETE` | topic CRUD and ordering |
| `/api/hashtags/recommendations` | `GET` | hashtag recommendations |
| `/api/hashtags/feedback` | `POST` | hashtag feedback actions |
| `/api/knowmore` | `GET` | visible flashcards |
| `/api/knowmore/actions` | `POST` | flashcard review actions |
| `/api/knowmore/corrections` | `GET, POST` | flashcard/source correction events |
| `/api/knowmore/sync` | `POST` | force company knowledge refresh |
| `/api/nba` | `GET, POST` | read/create NBA items |
| `/api/feedback` | `GET, POST` | task feedback |
| `/api/feedback/analytics` | `GET` | task feedback analytics |
| `/api/release` | `GET` | app and prompt release metadata |

### Local AI bridge

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/agent/local` | `POST` | returns queued/no-op; hosted webapp does not call local AI directly |
| `/api/webhook/trigger` | `GET, POST` | returns queued/no-op; local AI must poll the shared database |

## Important current limitations

- the hosted webapp only reads and writes the shared database; local AI processing must be done by a separate worker that polls the database
- some public-search collection is opportunistic and less reliable than direct page fetch plus explicit evidence
- `NEWS` flashcards are being tightened aggressively and evidence-only publishing is still evolving
- provenance and version metadata are present but not yet surfaced uniformly in every user-facing place

## Recent shipped changes in `v0.8.0`

- unified `Source` records are now the primary raw-ingestion model in the active UI and API
- `Topics` is a first-class page and model that the local worker uses as research focus
- hashtags are part of the system annotation layer across data, Knowmore, and Checklist
- the hosted webapp only reads and writes the shared database; it does not call the local worker directly
- login, company selection, navigation, and pipeline page accents were refreshed to match the 4-step workflow
- the local worker now runs as a serial per-company cycle with explicit maintenance lanes instead of one mixed poll loop
- a new `researchHarvest` lane can create new AI-harvested `Source` rows from topic-aligned public research
- Knowmore cards sourced from those harvested research rows are marked as sovereign research in the API/UI contract

## Documentation ownership

Use these files intentionally:

- `README.md`
  - current product overview, stack, routes, setup, and API inventory
- `SPEC.md`
  - current product and system specification
- `docs/ONBOARDING.md`
  - operator and developer setup
- `docs/HELP_SYSTEM.md`
  - in-app help system architecture and maintenance
- `docs/LOCAL_AI_PIPELINE.md`
  - online/local contract
- `DESIGN_SYSTEM.md`
  - UI grammar and component rules

Historical handoff notes belong in `docs/archive/`, not in active root documentation.

## Source of truth

If docs conflict with code, treat the code and Prisma schema as authoritative until the docs are corrected.

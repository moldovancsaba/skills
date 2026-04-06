# Checklist

Checklist is a split-system product:

- the `online webapp` runs on Vercel and is the user-facing surface
- the `local AI layer` enriches source evidence, generates flashcards, and helps drive NBA task generation
- Neon Postgres is the shared system of record

Current app version:
- `v0.1.0`

## Current architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Online webapp (Vercel)                                    │
│ https://checklist.messmass.com                            │
│ - Next.js 16 app router                                   │
│ - user-facing data entry                                  │
│ - Knowmore flashcards                                     │
│ - NBA checklist tasks                                     │
│ - feedback capture                                        │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ writes / reads
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Shared database (Neon Postgres via Prisma)                │
│ - companies, products, customers, competitors             │
│ - flashcards + flashcard actions                          │
│ - NBA items + feedback                                    │
│ - public ID counters                                      │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               │ sync / enrichment
                               ▼
┌────────────────────────────────────────────────────────────┐
│ Local AI system                                            │
│ - optional local sync worker / control-plane wrapper       │
│ - local URL fetch + public signal collection               │
│ - local model reasoning                                    │
│ - flashcard generation / refresh                           │
│ - NBA generation support                                   │
└────────────────────────────────────────────────────────────┘
```

## Product model

Checklist now follows a 3-layer model:

1. `DATA`
   - raw user-ingested records
   - products, customers, competitors
   - raw means the source record should remain user-entered, not rewritten into derived knowledge

2. `FLASHCARDS`
   - processed knowledge atoms shown on `/:companyId/knowmore`
   - derived from source evidence and public signals
   - carry `confidence`, `impact`, `weight`, provenance, and review state

3. `TASKS`
   - NBA checklist items shown on `/:companyId/nba`
   - generated from flashcards and company context
   - carry `impact`, `confidence`, `ease`, and `ICE`

## Current user-facing routes

| Route | Purpose |
|---|---|
| `/` | company selection / create company |
| `/[companyId]` | company dashboard |
| `/[companyId]/data` | raw source data entry |
| `/[companyId]/knowmore` | flashcards / knowledge layer |
| `/[companyId]/nba` | checklist tasks / next best actions |
| `/auth` | auth page |
| `/privacy` | privacy policy |
| `/terms` | terms |

## Current core behaviors

- `public IDs`
  - user-facing records have readable integer IDs in addition to UUIDs
- `Knowmore flashcards`
  - kinds include `CONCLUSION`, `EVALUATION`, `JUDGMENT`, `RECOMMENDATION`, `COMPARISON`, `NEWS`, `FORECAST`, `PRICE`, `EXPLANATION`, `RESEARCH`, `GOSSIP`, `STOCK`
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
- `ICE scoring`
  - `Impact: 0-10`
  - `Confidence: 0-100`
  - `Ease: 0-10`
  - formula: `impact * (confidence / 10) * ease`
  - output range: `0-1000`

## Tech stack

- `Next.js 16.2.2`
- `React 18`
- `Prisma + Neon Postgres`
- `Tailwind + shadcn-ui`
- `Ollama` for local model execution

## Development

Install:

```bash
npm install
```

Run dev server:

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

## Environment

Required environment variables are local-only secrets and must not be committed to docs or source control.

At minimum, this app expects:

- `DATABASE_URL`
- `APP_SESSION_SECRET`
- `SSO_CLIENT_ID`
- `SSO_CLIENT_SECRET`
- `SSO_AUTH_URL`
- `SSO_TOKEN_URL`
- local AI / sync envs where applicable:
  - `OLLAMA_URL`
  - `OLLAMA_MODEL`
  - `LOCAL_SYNC_URL`
  - `LOCAL_SYNC_SECRET`

Use local `.env` / Vercel project env management. Do not place real credentials in documentation.

## Database contract

There is a single Checklist database schema for this product:

- Prisma schema path: `prisma/schema.prisma`
- Prisma datasource env: `DATABASE_URL`

If you run a local sync process, wrapper, or control-plane integration on another machine, it must connect to the same Checklist database by using the same Checklist `DATABASE_URL`.

Important:

- there is no second Checklist Prisma schema inside `apps/mvp-factory-control`
- `mvp-factory-control` may host or trigger a local worker, but it is not the source of Checklist schema truth
- if setup fails on a new machine, treat it as a missing Checklist database connection or missing `prisma db push`, not as a bad path to another app's schema

## Main APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/companies` | `GET, POST, PATCH, DELETE` | company CRUD |
| `/api/products` | `GET, POST, PATCH, DELETE` | product source CRUD |
| `/api/customers` | `GET, POST, PATCH, DELETE` | customer source CRUD |
| `/api/competitors` | `GET, POST, PATCH, DELETE` | competitor source CRUD |
| `/api/knowmore` | `GET` | read visible flashcards |
| `/api/knowmore/actions` | `POST` | flashcard accept / decline / modify+accept |
| `/api/knowmore/sync` | `POST` | force flashcard regeneration for a company |
| `/api/nba` | `GET, POST` | read/create NBA items |
| `/api/feedback` | `GET, POST` | task feedback + task review updates |
| `/api/agent/local` | `POST` | trigger local NBA generation |
| `/api/webhook/trigger` | `POST` | bridge to local sync when reachable |

## Important current limitations

- direct Vercel-to-local delivery only works if `LOCAL_SYNC_URL` is publicly reachable
- some public-search collection is opportunistic and less reliable than direct page fetch + news signals
- `NEWS` flashcards are being tightened aggressively; evidence-only publishing is still evolving
- `v0.1.0` means behavior is still changing and provenance/version tagging is not yet fully implemented on every generated artifact

## Source of truth

If docs conflict with code, treat the code and Prisma schema as authoritative until the docs are corrected.

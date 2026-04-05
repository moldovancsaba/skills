# Checklist - Marketing OS

AI-powered marketing checklist and Next Best Actions (NBA) system.

## Architecture

```
┌─────────────────────────────────────────────┐
│            ONLINE (Vercel)                  │
│   https://checklist.messmass.com            │
│   - Neon PostgreSQL                         │
│   - Next.js 14                             │
│   - User interface                         │
└─────────────────────┬───────────────────────┘
                       │
                       │ Sync (poll every 5 min)
                       ▼
┌─────────────────────────────────────────────┐
│         LOCAL (mvp-factory-control)         │
│   - Ollama (llama3.2:1b → fallbacks)        │
│   - AI processing                          │
│   - URL scraping & enrichment              │
│   - Smart deduplication (Jaccard ≥ 0.5)   │
│   - Knowledge catalog                     │
└─────────────────────────────────────────────┘
```

## URLs

| URL | Description |
|-----|-------------|
| `/` | Company selector (create/edit/delete) |
| `/[companyId]` | Company dashboard |
| `/[companyId]/data` | Add data (products, customers, competitors) |
| `/[companyId]/nba` | My Tasks (pending actions) |
| `/auth` | SSO Login page |
| `/privacy` | Privacy Policy |
| `/terms` | Terms & Conditions |

## Features

- **SSO Login**: Google OAuth via sso.doneisbetter.com (#46)
- **Dark Mode**: System preference + manual toggle (#40)
- **Cookie Consent**: Banner with marketing preferences (#47)
- **Legal**: Privacy Policy (#44), Terms & Conditions (#45)
- **Footer Version**: Display app version (#43)
- **Full CRUD** for companies on home page
- **Data Collection**: Products, customers, competitors
- **AI-Powered Tasks**: Local Ollama generates NBA recommendations
- **Smart Deduplication**: Jaccard similarity (0.5 threshold)
- **Enrichment**: URL scraping + knowledge catalog (#48-49, #51)
- **First-Run Sync**: Full sync on initial startup
- **Force Trigger**: `/force` endpoint for manual sync
- **Feedback Loop**: Accept/decline with optional comments
- **Auto-Refresh**: Tasks refresh every 10 minutes
- **Archive**: View completed/declined tasks

## Tech Stack

- **Frontend**: Next.js 14, Tailwind, shadcn-ui
- **Database**: PostgreSQL (Neon)
- **AI**: Ollama (llama3.2:1b → gemma3:1b → qwen2.5:3b → deepseek-r1:1.5b)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables in `.env`:
```
DATABASE_URL=postgresql://neondb_owner:...@neon.tech/neondb
APP_SESSION_SECRET=<generate with: openssl rand -base64 32>
SSO_CLIENT_ID=<from doneisbetter.com>
SSO_CLIENT_SECRET=<from doneisbetter.com>
SSO_AUTH_URL=https://sso.doneisbetter.com/api/oauth/authorize
SSO_TOKEN_URL=https://sso.doneisbetter.com/api/oauth/token
```

3. Run locally:
```bash
npm run dev
```

4. Run local sync (via mvp-factory-control):
```bash
# Start ChecklistSync service in mvp-factory-control
# Port 3001, uses NEON_DB environment variable
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET, POST | List/create companies |
| `/api/companies?id=` | PATCH, DELETE | Update/delete company |
| `/api/products` | GET, POST | Products CRUD |
| `/api/customers` | GET, POST | Customers CRUD |
| `/api/competitors` | GET, POST | Competitors CRUD |
| `/api/nba` | GET | Get NBA items |
| `/api/feedback` | POST | Accept/decline feedback |
| `/api/auth/login` | GET | SSO login redirect |
| `/api/auth/callback` | GET | OAuth callback |
| `/api/auth/session` | GET | Get session |
| `/api/auth/logout` | GET | Logout |
| `/api/webhook/trigger` | POST | Trigger sync (internal) |

## Sync Engine (mvp-factory-control)

The sync engine runs on port 3001 in mvp-factory-control:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:3001/health` | GET | Health check |
| `http://localhost:3001/sync` | POST | Trigger sync |
| `http://localhost:3001/force` | POST | Force full sync |

Features:
- Polls every 5 minutes for new data
- First-run does full sync (all data, not just new)
- Deduplication threshold: 0.5
- URL scraping for enrichment
- Knowledge catalog per company

## Flow

1. User adds data (product, customer, competitor)
2. Webhook fires (if local sync reachable)
3. Local sync polls every 5 min for new data
4. URL enrichment (scrape linked content)
5. AI analyzes data + feedback history
6. Generates 3 NBA recommendations
7. Deduplicates (threshold 0.5)
8. Pushes to Neon DB
9. User sees new tasks on refresh

## License

MIT
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
│   - Ollama (gemma3:1b → fallbacks)          │
│   - AI processing                          │
│   - Smart deduplication (Jaccard ≥ 0.7)    │
└─────────────────────────────────────────────┘
```

## URLs

| URL | Description |
|-----|-------------|
| `/` | Company selector (create/edit/delete) |
| `/[companyId]` | Company dashboard |
| `/[companyId]/data` | Add data (products, customers, competitors) |
| `/[companyId]/nba` | My Tasks (pending actions) |

## Features

- **Dark Mode** - System preference + manual toggle (roadmap #40)
- **Full CRUD** for companies on home page
- **Data Collection**: Products, customers, competitors
- **AI-Powered Tasks**: Local Ollama generates NBA recommendations
- **Smart Deduplication**: Jaccard similarity (0.7 threshold) prevents duplicates
- **Feedback Loop**: Accept/decline with optional comments
- **Auto-Refresh**: Tasks refresh every 10 minutes
- **Archive**: View completed/declined tasks

## Tech Stack

- **Frontend**: Next.js 14, Tailwind, shadcn-ui
- **Database**: PostgreSQL (Neon)
- **AI**: Ollama (gemma3:1b → llama3.2:3b → qwen2.5:3b → deepseek-r1:1.5b)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables in `.env`:
```
DATABASE_URL=postgresql://...
```

3. Run locally:
```bash
npm run dev
```

4. For local AI, run sync:
```bash
cd scripts/checklist-sync
NEON_DB=$DATABASE_URL node sync.js
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
| `/api/webhook/trigger` | POST | Trigger sync (internal) |

## Flow

1. User adds data (product, customer, competitor)
2. Webhook fires (if local sync reachable)
3. Local sync polls every 5 min for new data
4. AI analyzes data + feedback history
5. Generates 3 NBA recommendations
6. Deduplicates against existing
7. Pushes to Neon DB
8. User sees new tasks on refresh

## License

MIT
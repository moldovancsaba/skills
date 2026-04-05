# Checklist - Marketing OS Specification

## Current Status: Production (v1.0)

### What Works ✅
- Company CRUD on home page (`/`)
- Clean URL routing: `/[companyId]`
- Data collection: Products, Customers, Competitors
- AI-powered task generation via local Ollama
- Smart deduplication (Jaccard similarity ≥ 0.5)
- URL scraping & knowledge enrichment
- First-run full sync
- Force sync endpoint
- Feedback: Accept (optional comment) / Decline (required)
- Archive toggle to show/hide completed tasks
- SSO Login via doneisbetter.com (Google OAuth)
- Dark mode toggle
- Cookie consent banner
- Privacy Policy & Terms pages

### Routes
| Path | Description |
|------|-------------|
| `/` | Company selector/CRUD |
| `/auth` | SSO login |
| `/privacy` | Privacy Policy |
| `/terms` | Terms & Conditions |
| `/[companyId]` | Dashboard (products, customers, competitors counts) |
| `/[companyId]/data` | Add data |
| `/[companyId]/nba` | My Tasks (pending actions) |

### Architecture
```
Online (Vercel)              Local (mvp-factory-control)
- PostgreSQL (Neon)    <--->  - Ollama (AI)
- Next.js 14                  - Sync script (port 3001)
- Tailwind/shadcn            - URL scraping
                             - Knowledge catalog
                             - Polls every 5 min
```

### Tech Stack
- Frontend: Next.js 14, Tailwind, shadcn-ui
- Database: PostgreSQL (Neon)
- AI: Ollama (llama3.2:1b → gemma3:1b → qwen2.5:3b → deepseek-r1:1.5b)
- Auth: doneisbetter.com OAuth2 with PKCE

### Issues Implemented
| Issue | Status | Description |
|-------|--------|-------------|
| #40 | Done | Dark Mode Toggle |
| #43 | Done | Footer Version |
| #44 | Done | Privacy Policy |
| #45 | Done | Terms & Conditions |
| #46 | Done | SSO Login (doneisbetter.com) |
| #47 | Done | Cookie Consent |
| #48 | Done | Online Search (via enrichment) |
| #49 | Done | URL Scraping |
| #50 | Roadmap | Chunking & Indexing |
| #51 | Done | Knowledge Catalog |

### Sync Engine Endpoints
| Endpoint | Description |
|-----------|-------------|
| `/health` | Health check |
| `/sync` | Trigger sync for new data |
| `/force` | Force full sync |

### Known Fixes Applied
- First-run does full sync (not just new data since lastSync)
- Deduplication threshold lowered from 0.7 to 0.5
- Force endpoint for manual sync trigger

## Roadmap (v1.1+)

| Issue | Description |
|-------|-------------|
| #36 | Analytics Page - Task metrics |
| #37 | Export Tasks to CSV |
| #38 | Email Notifications |
| #39 | Multi-User Support |
| #50 | Chunking & Indexing |

---

**Document Status:** Current  
**Last Updated:** 2026-04-05
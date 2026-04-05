# Checklist - Marketing OS Specification

## Current Status: Production (v1.0)

### What Works ✅
- Company CRUD on home page (`/`)
- Clean URL routing: `/[companyId]`
- Data collection: Products, Customers, Competitors
- AI-powered task generation via local Ollama
- Smart deduplication (Jaccard similarity ≥ 0.7)
- Feedback: Accept (optional comment) / Decline (required)
- Archive toggle to show/hide completed tasks

### Routes
| Path | Description |
|------|-------------|
| `/` | Company selector/CRUD |
| `/[companyId]` | Dashboard (products, customers, competitors counts) |
| `/[companyId]/data` | Add data |
| `/[companyId]/nba` | My Tasks (pending actions) |

### Architecture
```
Online (Vercel)              Local (mvp-factory-control)
- PostgreSQL (Neon)    <--->  - Ollama (AI)
- Next.js 14                  - Sync script (port 3001)
- Tailwind/shadcn            - Polls every 5 min
```

### Tech Stack
- Frontend: Next.js 14, Tailwind, shadcn-ui
- Database: PostgreSQL (Neon)
- AI: Ollama (gemma3:1b → llama3.2:3b → qwen2.5:3b → deepseek-r1:1.5b)

## Roadmap (v1.1+)

| Issue | Description |
|-------|-------------|
| #36 | Analytics Page - Task metrics |
| #37 | Export Tasks to CSV |
| #38 | Email Notifications |
| #39 | Multi-User Support |
| #40 | Dark Mode |
| #43 | Footer Version |
| #44 | Privacy Policy |
| #45 | Terms & Conditions |
| #46 | SSO Login (doneisbetter.com) |
| #47 | Cookie Consent & Marketing |

---

**Document Status:** Current  
**Last Updated:** 2026-04-04
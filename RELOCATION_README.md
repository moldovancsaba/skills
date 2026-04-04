# Checklist Marketing OS - Relocation Package

## For the Agent on the Other Side

Welcome to the Checklist Marketing OS project. This file contains everything you need to get up and running on a new machine.

---

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/sovereignsquad/checklist.git
cd checklist
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Environment Variables
Create a `.env` file in the project root:
```env
# Neon PostgreSQL (get from https://neon.tech)
DATABASE_URL="postgresql://..."

# Optional: Paperclip credentials (for Phase 5 agents)
PAPERCLIP_API_KEY=""
PAPERCLIP_COMPANY_ID=""
```

### 4. Push Database Schema
```bash
npx prisma db push
```

### 5. Run Locally
```bash
npm run dev
```
Open http://localhost:3000

---

## Project Structure

```
checklist/
├── src/
│   ├── app/              # Next.js pages
│   │   ├── dashboard/    # Main dashboard with NBA checklist
│   │   ├── products/     # Product CRUD
│   │   ├── customers/    # Customer management
│   │   ├── competitors/  # Competitor intel
│   │   └── api/          # API routes
│   └── lib/              # Utilities (db.ts, store.ts)
├── prisma/
│   └── schema.prisma     # Database schema
├── agents/
│   ├── prompts/          # Paperclip agent prompts
│   ├── scripts/          # Agent creation scripts
│   └── README.md         # Agent documentation
├── IDEABANK/
│   └── skills/           # Marketing skills documentation
├── scripts/
│   └── sync.js           # Sync layer (Phase 6)
└── .env                  # Environment (DO NOT COMMIT)
```

---

## Current Status

| Phase | Status |
|-------|--------|
| Phase 1-4 (DB, CMS, NBA, Feedback) | ✅ Complete |
| Phase 5 (Paperclip Agents) | 🔴 Blocked - needs credentials |
| Phase 6 (Sync Layer) | ⏳ Not started |
| Loveable Import (UI Components) | 📋 Next task |

### Current Blocker
Phase 5 (Paperclip Agents) requires:
- `PAPERCLIP_API_KEY` - Get from Paperclip dashboard
- `PAPERCLIP_COMPANY_ID` - Get from Paperclip dashboard

---

## Next Tasks (Priority Order)

### Option A: Get Paperclip Credentials
1. Get API key from Paperclip
2. Add to `.env`
3. Run `node agents/scripts/create-agents.js`
4. Agents will generate NBA items

### Option B: Continue Loveable UI Import
1. Install Tailwind CSS + shadcn-ui dependencies
2. Import 49 UI components from `/Users/Shared/Projects/loveable-import/`
3. Redesign dashboard with new components
4. Build feature pages (Intelligence, Lead Gen, CRM, etc.)

---

## Deployment

### Vercel
The app is deployed at: https://checklist-narimato.vercel.app

To deploy:
1. Connect repo to Vercel
2. Set `DATABASE_URL` environment variable in Vercel
3. Deploy automatically on push to main

### Database
Neon PostgreSQL is used as the cloud database. Connection string in `.env`.

---

## Key Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Full system design specification |
| `IDEABANK.md` | Marketing skills to integrate |
| `LOVEABLE_IMPORT.md` | Features from Loveable export |
| `agents/README.md` | Paperclip agent setup guide |

---

## GitHub Issues

All tasks tracked in GitHub:
- Issues #1-6: MVP Phases
- Issues #7-20: IDEABANK Skills
- Issues #21-30: Loveable Features
- Issue #30: shadcn-ui component library (next)

View at: https://github.com/sovereignsquad/checklist/issues

---

## Need Help?

1. Check `SPEC.md` for system design
2. Check `agents/README.md` for agent setup
3. Review GitHub issues for current priorities
4. Check the implementation plan in `.kilo/plans/`

---

**Last Updated:** 2026-04-04
**Commit:** `6876cdc` - feat(agents): Add Paperclip agent prompts, scripts, and implementation plan
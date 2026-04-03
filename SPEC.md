# Marketing Operating System — System Design Specification

**Project:** Checklist Marketing OS  
**Repository:** https://github.com/sovereignsquad/checklist  
**Cloud DB:** Neon (PostgreSQL)  
**Author:** Kilo (System Architect)  
**Date:** 2026-04-03  
**Status:** High-Level Design — Rewriting from scratch

---

## 1. Executive Summary

A local-first marketing operating system powered by AI agents that:

1. Ingests company, product, customer, and competitor data
2. Runs 24/7 locally via Paperclip AI agents
3. Recommends 3 NBA (Next Best Actions) as actionable checklist items
4. Learns from user feedback (accept/decline + annotations)
5. Syncs with cloud DB for webapp access

**Core Principle:** All data lives locally first. Cloud is a sync target, not the source of truth.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER WEBAPP                                 │
│                    (Vercel + Neon)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │
│  │   CMS UI    │  │  Checklist │  │  Analytics │                   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │
│         │                │                │                          │
│         └────────────────┼────────────────┘                          │
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Sync Layer  │ (pull/push daily)                │
│                  └───────┬───────┘                                  │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                     (daily sync)
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Local DB    │ (SQLite via Turso LibSQL)         │
│                  └───────┬───────┘                                  │
│                          │                                         │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                        │
│  ┌─────────────┐  ┌─────────────���  ┌─────────────┐                 │
│  │   Ingest    │  │    NBA      │  │    ICE      │                 │
│  │   Pipeline  │  │   Engine    │  │   Scorer    │                 │
│  └─────────────┘  └─────────────┘  └────────────┘                 │
│                          │                                         │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                        │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              Paperclip AI Agent Team                      │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │     │
│  │  │  Orchestr. │  │  Specialist │  │  Specialist │         │     │
│  │  │   Agent    │  │   Agents    │  │   Agents    │         │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                          │                                         │
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Local App   │ (background daemon)              │
│                  └───────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER WEBAPP                                 │
│                    (Vercel + Neon)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │
│  │   CMS UI    │  │  Checklist │  │  Analytics │                   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │
│         │                │                │                          │
│         └────────────────┼────────────────┘                          │
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Sync Layer  │ (pull/push daily)                │
│                  └───────┬───────┘                                  │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                    (daily sync)
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Local DB    │ (SQLite via Turso LibSQL)         │
│                  └───────┬───────┘                                  │
│                          │                                         │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Ingest    │  │    NBA      │  │    ICE      │                 │
│  │   Pipeline  │  │   Engine    │  │   Scorer    │                 │
│  └─────────────┘  └─────────────┘  └��────────────┘                 │
│                          │                                         │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                        │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              Paperclip AI Agent Team                      │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │     │
│  │  │  Orchestr. │  │  Specialist │  │  Specialist │         │     │
│  │  │   Agent    │  │   Agents    │  │   Agents    │         │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                          │                                         │
│                          ▼                                         │
│                  ┌───────────────┐                                  │
│                  │  Local App   │ (background daemon)              │
│                  └───────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

> **NOTE:** This is a complete rewrite. All existing files will be replaced.

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Cloud DB** | **Neon** (PostgreSQL) | Serverless, per-user branching, generous free tier |
| **Local DB** | Turso (libSQL) | SQLite compatible, local-first, sync to Neon |
| **Webapp** | Next.js 15 (App Router) | Latest, Vercel-native |
| **Auth** | next-auth v5 (Auth.js) | Per-user sessions |
| **Styling** | Tailwind CSS | Per existing preference |
| **State** | Zustand | Lightweight state |
| **Git** | GitHub | Already in use |
| **Hosting** | Vercel | Already in use |
| **AI Agents** | Paperclip | User requirement |
| **Agent Runtime** | Local (Ollama) or Cloud | Via Paperclip adapter |

---

## 4. Data Model

### 4.1 Core Entities (NEW - designed from scratch)

```
User
├── id              UUID
├── email           String (unique)
├── name            String?
├── companyId       UUID (FK)
├── role            Enum (OWNER/ADMIN/MEMBER)
├── createdAt       DateTime
└── updatedAt       DateTime

Company
├── id              UUID
├── name            String
├── industry        String?
├── description    String?
├── targetMarket   String?
├── mainGoal      Enum (grow_revenue, launch_product, etc)
├── createdAt       DateTime
└── updatedAt       DateTime

Product
├── id              UUID
├── companyId       UUID (FK)
├── name            String
├── description    String?
├── pricing        String?
├── features       String[]
├── urls           String[]
├── createdAt       DateTime
└── updatedAt       DateTime

Customer
├── id              UUID
├── companyId       UUID (FK)
├── name            String
├── email           String?
├── segments       String[]
├── painPoints     String[]
├── channels      String[]
├── lifetimeValue Float?
├── notes         String?
├── createdAt       DateTime
└── updatedAt       DateTime

Competitor
├── id              UUID
├── companyId       UUID (FK)
├── name            String
├── urls            String[]
├── pricing        String?
├── strengths     String[]
├── weaknesses   String[]
├── positioning  String?
├── watchedContent JSON (youtube, blogs, etc)
├── createdAt       DateTime
└── updatedAt       DateTime

NBAItem (Next Best Action)
├── id              UUID
├── companyId       UUID (FK)
├── title           String
├── description    String?
├── impact         Int (1-10)
├── confidence     Int (0-100)
├── ease           Int (1-10)
├── iceScore       Float (calculated)
├── status         Enum (pending/accepted/declined)
├── userAnnotation String? (mandatory on decline)
├── createdAt       DateTime
├── updatedAt       DateTime
└── scheduledDate  DateTime

Feedback
├── id              UUID
├── nbaItemId      UUID (FK)
├── action         Enum (accept/decline)
├── annotation    String? (mandatory on decline!)
├── iceImpact     Float
└── createdAt     DateTime
```

### 4.2 Prisma Schema

```prisma
// Marketing-specific extensions

model Product {
  id          String   @id @default(uuid())
  companyId   String
  name        String
  description String?
  pricing     String?
  features    String[]
  urls        String[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Customer {
  id            String   @id @default(uuid())
  companyId     String
  name          String
  email         String?
  segments      String[]
  painPoints    String[]
  channels     String[]
  lifetimeValue Float?
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model CompetitorIntel {
  id          String   @id @default(uuid())
  companyId  String
  name       String
  urls       String[]
  pricing    String?
  strengths  String[]
  weaknesses String[]
  positioning String?
  watchedContent Json?
  createdAt  DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model NBAFeedback {
  id             String   @id @default(uuid())
  actionId       String
  userAction     String   // "accept" | "decline"
  annotation     String?  // Mandatory on decline!
  iceImpact      Float?
  createdAt      DateTime @default(now())
}

### 4.2 ICE Scoring

```
ICE = Impact × Confidence × Ease

- Impact: 1-10 (how much this moves the needle)
- Confidence: 0-100% (probability this works)
- Ease: 1-10 (difficulty to execute)

Score = (Impact × 10) × (Confidence / 100) × (Ease × 10)
Score Range: 0-100

Rotten Period:
- Each item has `rotten_after_days` (default 7)
- Score decays linearly after deadline passed
- Decay rate: -5 points per day overdue
- Minimum score: 10 (never reaches 0)
```

---

## 5. Paperclip Agent System

### 5.1 Agent Hierarchy

```
┌─────────────────────────────────────────┐
│      Marketing Orchestrator           │
│  (Primary Agent - reports to CEO)    │
│                                      │
│  - Owns company context              │
│  - Drives daily strategy            │
│  - Delegates to specialists        │
│  - Synthesizes NBA recommendations     │
└───────────────┬───────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Product │ │Customer│ │Compet. │
│Special.│ │Special.│ │Special.│
│Agent   │ │Agent   │ │Agent   │
└────────┘ └────────┘ └────────┘
```

### 5.2 Agent Roles

| Agent | Role | Responsibilities |
|-------|------|-----------------|
| **Marketing Orchestrator** | CTO/CPO | Understand business, coordinate specialists, generate NBAs |
| **Product Specialist** | Product Manager | Analyze products, identify gaps, recommend improvements |
| **Customer Specialist** | Market Research | Analyze customer data, identify segments, find insights |
| **Competitor Specialist** | Competitive Intel | Monitor competitors, analyze positioning, flag threats |

### 5.3 Agent Configuration (per paperclip-create-agent)

```typescript
// Example (actual config via Paperclip API)
{
  name: "Marketing Orchestrator",
  role: "marketing_orchestrator",
  title: "Chief Marketing Officer",
  icon: "brain",
  reportsTo: "<ceo-agent-id>",
  adapterType: "codex_local", // or claude_local
  adapterConfig: {
    model: "o4-mini",
    cwd: "/path/to/checklist/local"
  },
  capabilities: "Owns marketing strategy, generates NBAs, coordinates specialists",
  desiredSkills: ["marketing-analyst", "competitor-research"]
}
```

---

## 6. NBA Engine

### 6.1 Generation Flow

```
1. USER SUBMITS DATA
   │
   ▼
2. INGEST PIPELINE
   - Parse uploads (text, URLs, files)
   - Extract structured data
   - Store in local DB
   │
   ▼
3. SPECIALIST AGENTS RUN
   - Product Specialist → product gaps
   - Customer Specialist → customer insights
   - Competitor Specialist → competitive intel
   │
   ▼
4. ORCHESTRATOR SYNTHESIZES
   - Review all specialist outputs
   - Generate 3 NBA candidates
   - Score via ICE model
   │
   ▼
5. CHECKLIST DELIVERED
   - Push 3 items to checklist
   - Set rotten period (7 days)
   - Schedule review
```

### 6.2 Output Rules

- Always exactly 3 items on checklist
- If all completed/declined → generate 3 new
- If some pending → keep pending, add new to reach 3
- Score must be ≥50 to be recommended (configurable)

---

## 7. Feedback System

### 7.1 User Actions

| Action | Checkbox | Annotation | Weight |
|--------|---------|-------------|--------|
| **Accept** | ✅ checked | Optional | +ICE feedback to scorer |
| **Decline** | ❌ declined | **Mandatory** | -Heavy weight to scorer |

### 7.2 Learning Algorithm

```
On ACCEPT:
  - Add to positive_examples
  - Boost similar future NBAs
  - Increase source agent confidence
  - ice_score = ice_score × 1.1

On DECLINE:
  - Add to negative_examples  (with mandatory annotation)
  - Significant penalty to source agent
  - ice_score = ice_score × 0.5
  - Log annotation for training

On IDLE (past rotten period):
  - Decay score: -5 per day
  - Auto-decline after 14 days
```

---

## 8. Sync Layer

### 8.1 Architecture

```
┌─────────────────────────────────────────┐
│            DAILY SYNC                  │
│          (cron: 00:00 UTC)             │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    ▼                          ▼
┌─────────────┐          ┌─────────────┐
│  Push to    │          │  Pull from  │
│  Neon     │          │  Neon      │
│  (local→cloud)          │  (cloud→local)│
└─────────────┘          └─────────────┘
```

### 8.2 Sync Tables

| Direction | Tables Synced |
|-----------|---------------|
| Local → Cloud | companies, products, customers, competitors, checklist_items |
| Cloud → Local | checklist_items (status updates), feedback_log |
| Conflict | Local wins (user's primary workspace) |

### 8.3 Implementation

- Use Neon serverless function as sync endpoint
- Turso sync: `turso sync` CLI or libSQL sync protocol
- API route: `POST /api/sync` (called by local cron)

---

## 9. Webapp (CMS)

### 9.1 Pages

| Route | Description |
|-------|-------------|
| `/` | Landing + Login |
| `/dashboard` | Overview + 3 NBA checklist |
| `/company` | Company setup form |
| `/products` | Product/Service CRUD |
| `/customers` | Customer data upload |
| `/competitors` | Competitor intel upload |
| `/checklist` | Full checklist with filters |
| `/settings` | Sync status, account |

### 9.2 Checklist UI

```
┌────────────────────────────────────────────────┐
│  NEXT BEST ACTIONS                            │
├────────────────────────────────────────────────┤
│                                                │
│  □ 1. Launch referral program                  │
│     Priority: 78  |  Due: Tomorrow            │
│     [Accept] [Decline - add note]             │
│                                                │
│  □ 2. Create competitor landing page         │
│     Priority: 65  |  Due: in 3 days          │
│     [Accept] [Decline - add note]             │
│                                                │
│  □ 3. Write case study for top customer       │
│     Priority: 52  |  Due: in 5 days           │
│     [Accept] [Decline - add note]              │
│                                                │
└────────────────────────────────────────────────┘
```

### 9.3 Data Upload Forms

- Text input (multi-line)
- URL input (with auto-scrape optional)
- YouTube link (metadata extraction)
- File upload (PDF, CSV, images)
- Spreadsheet import (customers)

---

## 10. Local Daemon

- Runs as background service (launchd/systemd)
- Checks for new data daily at 02:00 local
- Runs Paperclip agents if new data present
- Syncs to cloud at 03:00 local
- Logs all activity to local file

---

## 11. Implementation Phases

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| **1** | Extend Prisma | Add Product, Customer, CompetitorIntel, NBAFeedback models |
| **2** | Build CMS UI | Forms for data upload, checklist UI |
| **3** | NBA Engine | Generate 3 NBA items with ICE scoring |
| **4** | Feedback System | Accept/decline with annotations |
| **5** | Paperclip Agents | Orchestrator + 3 specialists |
| **6** | Sync Layer | Local ↔ Cloud daily sync |

---

## 12. File Structure

```
/checklist
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Landing/Dashboard
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (auth)/            # Auth routes
│   │   ├── (dashboard)/        # Protected routes
│   │   │   ├── dashboard/     # Main dashboard
│   │   │   ├── company/       # Company setup
│   │   │   ├── products/      # Product CRUD
│   │   │   ├── customers/     # Customer data
│   │   │   ├── competitors/  # Competitor intel
│   │   │   └── checklist/    # NBA checklist
│   │   └── api/              # API routes
│   │       ├── auth/
│   │       ├── sync/
│   │       └── nba/
│   ├── components/            # React components
│   │   ├── ui/               # Base UI components
│   │   ├── forms/            # Form components
│   │   ├── checklist/        # Checklist components
│   │   └── agents/           # Agent UI components
│   ├── lib/                  # Utilities
│   │   ├── db.ts             # Prisma client
│   │   ├── ice.ts            # ICE scoring
│   │   ├── nba.ts           # NBA generation
│   │   └── sync.ts          # Sync layer
│   ├── agents/               # Paperclip agent configs
│   │   ├── orchestrator/
│   │   ├── product-specialist/
│   │   ├── customer-specialist/
│   │   └── competitor-specialist/
│   └── types/                # TypeScript types
├── prisma/
│   └── schema.prisma          # Extended schema
├── .env                     # Local env
├── README.md
└── SPEC.md                  # This spec
```

---

## 13. Next Steps

1. Approve this specification
2. Set up Neon DB
3. Extend Prisma schema
4. Build CMS pages
5. Create Paperclip agents

---

## 14. Project Board

> **NOTE:** The GitHub project board at https://github.com/orgs/sovereignsquad/projects/3 currently shows **0 projects**. We need to create one.

Proposed columns:
- **Backlog** — All new issues
- **In Progress** — Being worked on
- **Review** — Ready for review
- **Done** — Completed

---

**Document Status:** Draft — Awaiting Approval  
**Revision:** 2.0 (Complete Rewrite)
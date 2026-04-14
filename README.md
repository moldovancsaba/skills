# Sovereign Marketing OS (v0.11.3)

> **The Decentralized Intelligence Layer for Strategic Marketing.**

Sovereign Marketing OS is a high-performance, autonomous intelligence system designed to bridge the gap between raw market evidence and executive-level strategy. It leverages a unique **Online/Local split-architecture** to ensure maximum privacy, data sovereignty, and high-quality AI reasoning.

- **Frontend**: Premium Next.js 16 Web Interface (Unified Design System).
- **Intelligence**: Local **Trinity Synthesis Engine** powered by Ollama.
- **Persistence**: Hybrid MongoDB Atlas via Prisma.

## 🛡️ The Sovereign Paradigm

Unlike traditional "SaaS" tools that process your data in the cloud, Sovereign Marketing OS treats your data as a strategic asset. 

1. **Passive Ingress**: The webapp captures user intent and raw signals without expensive cloud-side processing.
2. **Local Authority**: All complex reasoning, IC&E scoring, and knowledge synthesis occur on your local hardware via the **Trinity Pipeline**.
3. **The Pulse**: A real-time bridge communicates the state of the local synthesis worker directly to the dashboard, providing transparency into the autonomous thinking process.

---

## 🌪️ Trinity Synthesis Pipeline

The system's core intelligence is governed by a three-pass autonomous loop:

| Pass | Role | Description |
| :--- | :--- | :--- |
| **Pass 1: DRAFTER** | *Extraction* | Scrubs raw sources, entities, and uploaded files to identify atomic insights. |
| **Pass 2: WRITER** | *Refinement* | Calculates strategic impact (ICE), generates provenance-backed flashcards, and drafts Next-Best-Actions. |
| **Pass 3: JUDGE** | *Audit* | Hardens the knowledge layer by rejecting low-confidence items and enforcing a statistical quality floor. |

---

## 🗺️ Product Architecture

The system operates across four distinct intelligence layers:

### 1. Unified Data (Ingress)
Raw market evidence, product docs, customer feedback, and competitor signals are ingested into a unified relational context.

### 2. Autonomous Topics (Strategy)
User-defined research focus areas that act as the **Primary Planner** for the AI. The Trinity Worker prioritizes processing for topics with high "Strategic Pressure".

### 3. Knowmore (Knowledge)
The synthesized Knowledge Layer. Atomic flashcards (`SUMMARY`, `FORECAST`, `JUDGMENT`) that carry verifiable confidence scores and provenance.

### 4. NBA Checklist (Action)
Next-Best-Action recommendations ranked by **ICE Score** (Impact, Confidence, Ease). These are derived directly from the Knowledge Layer to ensure every action is rooted in evidence.

---

## 🚀 Recent Innovations in v0.11.3

- **Unified Card UI**: A singular, premium card design system used across all intelligence layers, purging legacy patterns.
- **Synthesis Heartbeat**: A live "Pulse" indicator on the dashboard connected via a real-time proxy to the local worker.
- **Statistical Quality Floor**: The `JUDGE` actively demotes any card falling below the 10th percentile of verified intelligence.
- **Topic-Primary Synthesis**: Total alignment of the AI reasoning budget with the user's active strategic priorities.

---

## 🛠️ Stack & Operations

- **Frontend**: Next.js 16.2.2 + React 18 + TailwindCSS.
- **Design Primitives**: `UnifiedCard`, `AppShell`, `StructuredCard` (Hardened for Dark Mode).
- **Core Engine**: `Ollama` running Sovereign prompts.
- **Persistence**: `Prisma` + `MongoDB Atlas`.

### Development Setup

```bash
# 1. Install Dependencies
npm install

# 2. Synchronize Schema
npm run db:push
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

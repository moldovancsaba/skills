# Sovereign Marketing OS

> **The Decentralized Intelligence Layer for Strategic Marketing.**

Sovereign Marketing OS is an open-source, high-performance, autonomous intelligence system designed to bridge the gap between raw market evidence and executive-level strategy. It leverages a unique **Online/Local split-architecture** to ensure maximum privacy, data sovereignty, and high-quality AI reasoning.

## 🌟 Overview

Unlike traditional "SaaS" tools that process your proprietary business data in the cloud, Sovereign Marketing OS treats your data as a strategic asset.

1. **Passive Ingress**: The webapp captures user intent and raw signals without expensive cloud-side processing.
2. **Local Authority**: All complex reasoning, ICE scoring, and knowledge synthesis occur securely on your local hardware via the **Trinity Engine**.
3. **The Pulse**: A real-time bridge communicates the state of the local synthesis worker directly to your dashboard via MongoDB, providing transparency into the autonomous thinking process without direct network exposure.

## 🌪️ Trinity Synthesis Pipeline

The system's core intelligence is governed by a three-pass autonomous loop, enforcing strict mathematical boundaries (Axioms):

| Pass | Agent | Objective |
| :--- | :--- | :--- |
| **Pass 1** | **DRAFTER** | Scrubs raw sources, entities, and uploaded files to identify atomic insights and predict initial 1-10 metrics. |
| **Pass 2** | **WRITER** | Refines language, drops duplicates, and strictly calculates priority (Impact × Confidence × Ease). |
| **Pass 3** | **JUDGE** | Hardens the knowledge layer by rejecting low-confidence items and enforcing a statistical quality floor. Demoted items are cratered and removed from active flow. |

## 🗺️ Product Architecture

The system operates across five distinct intelligence layers:

1. **Data (Ingress)**: Raw market evidence, product docs, customer feedback, and competitor signals.
2. **Topics (Strategy)**: User-defined research focus areas that guide the AI's processing budget.
3. **Review (The Human Circuit)**: A fail-safe mechanism where items that the AI cannot mathematically score are routed for manual human annotation.
4. **Knowmore (Knowledge)**: The synthesized layer of atomic flashcards, carrying verifiable confidence scores and provenance.
5. **Checklist (Action)**: Next-Best-Action recommendations ranked by **ICE Score**.

## 🛠️ Tech Stack & Operations

This project is built for scale, performance, and security.

- **Frontend**: Next.js 16.2 (App Router) + React 18 + TailwindCSS.
- **Design Primitives**: Unified "Deep Dark" styling with dynamic Sovereign ICE color metric mapping.
- **Core Engine**: Local `Ollama` running specialized, fine-tuned agent prompts.
- **Persistence**: `Prisma` + `MongoDB Atlas` (Decoupled command-and-control).

## 🚀 Getting Started (Developers & Operators)

### 1. Prerequisites
- Node.js (v18+)
- MongoDB Atlas cluster URL
- Ollama installed locally

### 2. Setup
Clone the repository and install dependencies:
```bash
git clone https://github.com/sovereignsquad/checklist.git
cd checklist
npm install
```

### 3. Database Migration
Ensure your local `.env` contains your `DATABASE_URL`, then push the schema:
```bash
npm run db:push
npm run db:generate
```

### 4. Run the Ecosystem
Start the Web App:
```bash
npm run dev
```

In a separate terminal, ignite the local AI Trinity Engine background loop:
```bash
npm run background
```

## 📖 Documentation Directory
For deep architectural dives, refer to our extended internal specs:
- `SPEC.md`: Product and system specification schemas.
- `docs/ONBOARDING.md`: Detailed operator setup.
- `docs/LOCAL_AI_PIPELINE.md`: Breakdown of the online/local orchestration loop.
- `DESIGN_SYSTEM.md`: UI grammar and component rules.

---
*Built with precision by Sovereign Squad.*

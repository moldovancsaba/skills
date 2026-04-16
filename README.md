# 🌌 Sovereign Marketing OS

> **The Decentralized Intelligence Layer for Strategic Marketing.**

Sovereign Marketing OS is a high-performance, private-first autonomous intelligence system. It bridges the gap between raw market evidence and executive strategy by leveraging a unique **Online/Local split-architecture**. This ensures data sovereignty while providing access to state-of-the-art AI reasoning.

---

## 🏛️ Core Philosophy: Sovereign Mode
Unlike traditional SaaS tools that ingest your proprietary data into a central cloud, Sovereign Marketing OS treats your data as a protected strategic asset.

1.  **Passive Ingress**: The cloud-side web interface captures signals and intent without processing proprietary logic in the cloud.
2.  **Local Authority (Trinity Engine)**: All deep reasoning, ICE scoring, and knowledge synthesis occur on **your private infrastructure** (Local AI).
3.  **The Pulse**: A real-time, one-way bridge synchronizes the state of your local intelligence engine to the cloud dashboard, providing total transparency without exposing your network.

---

## 🌪️ The AI Trinity Pipeline
Strategic synthesis is governed by a three-pass autonomous loop, enforcing strict mathematical boundaries (Axioms).

| Agent | Pass | Role & Objective |
| :--- | :--- | :--- |
| **DRAFTER** | Pass 1 | **Evidence Extraction**: Scrubs raw sources, transcripts, and files to identify atomic insights and predict initial 1-10 metrics. |
| **WRITER** | Pass 2 | **Strategic Synthesis**: Refines language, eliminates duplicates, and strictly calculates the **ICE Priority Score**. |
| **JUDGE** | Pass 3 | **Quality Audit**: Hardens the knowledge layer by rejecting low-confidence items and enforcing a statistical quality floor. |

---

## 💎 Core Axioms (The Rules of Intelligence)
*   **Mathematical Merit**: No item is promoted without a calculated ICE Score (Impact × Confidence × Ease).
*   **Default Skepticism**: New entities start with a "Quality Floor" check. If the Judge cannot verify the value, the item remains in **Review**.
*   **Human-in-the-loop**: High-ambiguity data is routed to the **Review Stage**, where human operators provide the "ground truth" that the engine uses to learn.
*   **Provenance**: Every flashcard and task is linked back to its original source material, ensuring verifiable intelligence.

---

## 🛠️ Architecture & Tech Stack

*   **Intelligence Layer**: Local `Ollama` running specialized agent models (Drafter, Writer, Judge).
*   **Frontend**: Next.js 16 (App Router) + React 18 + TailwindCSS.
*   **Design**: Unified "Deep Dark" aesthetics with dynamic ICE color mapping.
*   **Persistence**: Prisma + MongoDB Atlas (Decoupled command-and-control).

---

## 🚀 Deployment & Operations

### 1. Prerequisites
*   Node.js v18+
*   MongoDB Atlas Connection String
*   Ollama (installed on private local infrastructure)

### 2. Setup & Installation
```bash
git clone https://github.com/sovereignsquad/checklist.git
cd checklist
npm install
```

### 3. Database Sync
```bash
# Push schema to your MongoDB instance
npm run db:push
npm run db:generate
```

### 4. Igniting the Engine
Start the web dashboard:
```bash
npm run dev
```

In a separate terminal, ignite the local **Trinity Engine** background loop:
```bash
npm run background
```

---

## 🗺️ Product Roadmap
*   [x] **v0.11.0**: Sovereign Pulse implementation & Trinity Hardening.
*   [ ] **v0.12.0**: Advanced Multi-Tenant signal ingestion & Predictive Industry Tagging.
*   [ ] **v1.0.0**: Fully autonomous executive summary generation.

*Built with precision by Sovereign Squad.*

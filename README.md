# 🌌 Sovereign checklist (Marketing OS)

> **The Standalone Decentralized Intelligence Layer for Strategic Marketing.**

**checklist** is a high-performance, private-first autonomous intelligence system. It bridges the gap between raw market evidence and executive strategy by leveraging a unique **Local AI Authoritative Architecture**. This ensures data sovereignty while providing access to state-of-the-art AI reasoning without external cloud processing of proprietary logic.

---

## 🏛️ Core Philosophy: Total Independence
Unlike traditional SaaS tools that ingest your proprietary data into a central cloud, **checklist** operates as a hardened, standalone strategic asset.

1.  **Local Authority (Trinity Engine)**: All deep reasoning, ICE scoring, and knowledge synthesis occur on **your private infrastructure** via Ollama. No proprietary data is processed by external Sovereign/Nexus services.
2.  **Inventory Guard (Hard Bottlenecking)**: The engine enforces a strict **100-card limit** per organization. Once the checklist inventory reaches 100 active items, autonomous synthesis pauses to prevent resource overflow and cognitive clutter.
3.  **Language Purity**: Strict organization-level language policies ensure the knowledge base remains 100% monolingual or adheres to specific approved languages. Disallowed content is purged automatically during synthesis.

---

## 🌪️ The AI Trinity Pipeline
Strategic synthesis is governed by a three-pass autonomous loop, enforcing strict mathematical boundaries (Axioms).

| Agent | Pass | Role & Objective |
| :--- | :--- | :--- |
| **DRAFTER** | Pass 1 | **Evidence Extraction**: Scrubs raw sources, transcripts, and files to identify atomic insights and predict initial 1-10 metrics. |
| **WRITER** | Pass 2 | **Strategic Synthesis**: Refines language, eliminates duplicates, and strictly calculates the **ICE Priority Score** (Impact × Confidence × Ease). |
| **JUDGE** | Pass 3 | **Quality Audit**: Hardens the knowledge layer by rejecting low-confidence items and enforcing a statistical quality floor. |

---

## 🛠️ Architecture & Tech Stack

*   **Intelligence Layer**: Local `Ollama` running specialized agent models (`qwen2.5:7b`, `gemma3:1b`).
*   **Frontend**: Next.js 16 (App Router) + React 18 + Mantine UI + TailwindCSS.
*   **Styling**: Theme-aware "Aesthetic Premium" tokens with dynamic contrast support for Light/Dark modes.
*   **Persistence**: Prisma + MongoDB Atlas (Decoupled command-and-control).
*   **Security**: Secret-protected Ingest API (`verifyIngestSecret`) for programmatic data entry.

---

## 🚀 Deployment & Operations

### 1. Prerequisites
*   Node.js v20+
*   MongoDB Atlas Connection String
*   Ollama (installed on private local infrastructure)

### 2. Environment Configuration
Create a `.env` file:
```bash
DATABASE_URL="mongodb+srv://..."
INGEST_SECRET="your-secure-token"
OLLAMA_URL="http://localhost:11434"
```

### 3. Setup & Installation
```bash
git clone https://github.com/sovereignsquad/checklist.git
cd checklist
npm install
npm run db:push
```

### 4. Running the System
Start the web dashboard:
```bash
npm run dev
```

Ignite the **Guardian Watchdog** (handles the Trinity Engine background loop):
```bash
npm run guardian
```

---

## 🗺️ Product Roadmap
*   [x] **v0.12.0**: Trinity Hardening & Sovereign Pulse implementation.
*   [x] **v0.14.0**: Production Hardening, 100-Card Bottlenecking, and Standalone Decoupling.
*   [ ] **v1.0.0**: Multi-agent tournament judging & Executive Summary synthesis.

*Built with precision for the Sovereign Marketing OS.*

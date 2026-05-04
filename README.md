# 🌌 Sovereign checklist (Marketing OS)
> **The Autonomous Recurrent Intelligence Layer for Strategic Marketing.**

**v1.4.0: Sovereign Intelligence Architecture**

**checklist** is a high-performance, private-first autonomous intelligence system. It implements the **Recurrent-Depth Transformer (RDT)** philosophy at the agent level, bridging the gap between raw market evidence and executive strategy through iterative self-refinement.

---

## 🏛️ Core Philosophy: Total Independence
**checklist** operates as a hardened, standalone strategic asset, enforcing data sovereignty through local inference.

1.  **Recurrent Reasoning (RDT Engine)**: The Drafter agent now processes intelligence in three computational phases (**Prelude, Recurrence, Coda**), anchoring every loop with raw evidence injection to prevent hallucination.
2.  **Tactical Kanban Orchestration**: A 5-column tactical board (**Idea Bank → Roadmap → Backlog → Todo → Checklist**) automatically organizes tasks based on multi-factor ICE scoring (Impact, Confidence, Ease).
3.  **Strategic Learning**: The system harvests manual "Hard Feedback" from the Kanban board. When you drag a card to a high-priority position, the AI learns your tactical intent and steers future generations toward those themes.

---

## 🌪️ The AI Trinity Pipeline (v1.2.0)
Strategic synthesis is governed by a recurrent multi-pass loop, enforcing strict mathematical boundaries.

| Agent | Architecture | Role & Objective |
| :--- | :--- | :--- |
| **DRAFTER** | **Recurrent RDT** | **Evidence Extraction**: Performs 3-pass iterative reasoning over raw sources to extract atomic strategic insights. |
| **WRITER** | **Strategic Refiner** | **Synthesis**: Refines language, eliminates semantic duplicates, and routes items to the correct **Tri-Layer** bucket (Knowledge, Strategy, Execution). |
| **JUDGE** | **Tournament Voter** | **Quality Audit**: Performs multi-model consensus judging to ensure 100% language purity and architectural integrity. |

---

## 📋 Tactical Horizons (Kanban)
The system automatically distributes taskcards across five tactical horizons based on their **ICE Score**:

*   **NOW (Checklist)**: ICE ≥ 700. The active frontier for immediate execution.
*   **NEXT (Todo)**: ICE ≥ 500. High-value tasks ready for the next sprint.
*   **SOONER (Backlog)**: ICE ≥ 250. Validated insights awaiting tactical capacity.
*   **LATER (Roadmap)**: ICE ≥ 100. Long-term strategic possibilities.
*   **SOMEDAY (Idea Bank)**: ICE < 100. Raw seeds and low-priority concepts.

---

## 🛠️ Technological Foundation
*   **Intelligence**: Local `Ollama` stack with RDT-simulation loops.
*   **Architecture**: **Tri-Layer Intelligence** (Knowledge, Strategy, Execution) with automated routing.
*   **Self-Healing**: **SCI (Self-Correcting Intelligence)** layer via Auditor/Reorganizer background cycles.
*   **Frontend**: Next.js 16 (App Router) + Mantine UI.
*   **Learning**: Context-aware priority harvesting (Strategic Context v2.0).
*   **Persistence**: Prisma + MongoDB Atlas + Periodic Guardian Orchestration.

---

## 📐 Technical Standards & UI Architecture
To maintain the premium "Sovereign" experience and ensure system stability, follow these architectural constraints:

### 1. Viewport-Constrained Layout (No Double Scrolls)
Complex interfaces like the **Tactical Board** must use a fixed-viewport architecture:
- Outer containers should use `height: calc(100vh - 80px)` and `overflow: hidden`.
- Independent scrolling must be handled by inner semantic blocks (e.g., Kanban columns).
- **NEVER** allow the global page scroll to compete with internal board scrolls.

### 2. Client-Side Orchestration (No Iframes)
The system uses **Dynamic Imports (`ssr: false`)** to manage browser-only libraries like `@hello-pangea/dnd`. 
- This is **NOT an iframe**. It is a standard React lazy-loading mechanism.
- Iframes are strictly forbidden to maintain SEO, performance, and security parity across the OS.

### 3. Modal & Overlay Z-Index
Modals rendered over complex interactive surfaces (DnD, Charts) must:
- Use `withinPortal: true` (standard Mantine behavior).
- Use an explicit `zIndex` of `3000` or higher to clear all interaction layers.

### 4. Design System Tokens
All `LinkCard` components must strictly use valid design tokens:
- **Allowed Variants**: `blue`, `amber`, `green`, `violet`, `teal`.
- **Customization**: Do not use ad-hoc color strings (like `cyan`) that break the TypeScript build.

---

## 🚀 Operations & Deployment

### 1. Environment Configuration
Create a `.env` file with your private infrastructure details:
```bash
DATABASE_URL="mongodb+srv://..."
INGEST_SECRET="your-secure-token"
OLLAMA_URL="http://localhost:11434"
```

### 2. Ignition
```bash
# Initialize the database
npx prisma db push

# Start the dashboard
npm run dev

# Ignite the Guardian Watchdog (Trinity Engine)
npm run guardian
```

---

## 🗺️ Product Roadmap
*   [x] **v0.14.0**: Production Hardening & Standalone Decoupling.
*   [x] **v1.0.0**: Multi-agent tournament judging & Executive Summary synthesis.
*   [x] **v1.2.0**: Recurrent Kanban Intelligence & Strategic Learning.
*   [x] **v1.4.0**: **Sovereign Intelligence Architecture (Tri-Layer & SCI).**
*   [ ] **v1.6.0**: Recursive Deliberation (Multi-pass Evaluator) & Autonomous Budget Forecasting.

*Built for the Sovereign Marketing Executive.*

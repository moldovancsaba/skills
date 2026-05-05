# 🌌 CHECKLIST
> **The Autonomous Recurrent Layer for Strategic Intelligence.**

**v0.15.0: Production Architecture**

**CHECKLIST** is a high-performance, private-first autonomous intelligence system. It implements the **Recurrent-Depth Transformer (RDT)** philosophy at the agent level, bridging the gap between raw market evidence and executive strategy through iterative self-refinement.

---

## 🏛️ Core Philosophy: Total Independence
**CHECKLIST** operates as a hardened, standalone strategic asset, enforcing data sovereignty through local inference.

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
*   **Architecture: Tri-Layer Intelligence**:
    *   **Knowledge (Knowmore)**: The foundation. Durable flashcards storing facts and insights about the company and market.
    *   **Strategy (Goals)**: The steering layer. High-level strategic goals that prioritize tactical outcomes.
    *   **Execution (Tactical)**: The delivery layer. Atomic tasks organized by ICE scores for immediate action.
*   **Self-Healing**: **SCI (Self-Correcting Intelligence)** layer via Auditor/Reorganizer background cycles (20-minute heartbeat).
*   **Frontend**: Next.js 16 (App Router) + Mantine UI.
*   **Learning**: Context-aware priority harvesting (Strategic Context v2.0).
*   **Persistence**: Prisma + MongoDB Atlas + Periodic Guardian Orchestration.

---

## 📐 Technical Standards & Design System
To maintain the premium experience and ensure system stability, follow these architectural constraints:

### 1. Mantine-First Mandate
The repository enforces a strict Mantine-native architecture. 
- **NO Tailwind Utilities**: Do not use ad-hoc Tailwind classes for layout or styling. 
- **Component Primitives**: Always use Mantine `Stack`, `Group`, `Box`, `Paper`, and `Card` for structural layout.
- **Visual Consistency**: All components must adhere to the hardened design tokens (glassmorphism, vibrant gradients, and blur filters).

### 2. Unified Grid Architecture
All strategic and tactical layers must implement the `UnifiedGrid` and `PageShell` patterns found in `@/components/ui/app-shell`.
- **`PageShell`**: Standardized viewport-aware container.
- **`UnifiedGrid`**: Automatic 3-column desktop / 1-column mobile responsive grid.

### 3. Intelligence Clarity (Metadata Filtering)
End-user displays must be purged of technical trace information.
- **Filtering Utility**: Always wrap user-facing text (titles, descriptions, labels) in the `stripTechnicalMetadata()` utility from `@/lib/ui-utils`.
- **Markers Purged**: `[TRACE:...]` and `[TOPIC_ID:...]` are strictly technical metadata and must remain invisible to the end user.

### 4. Premium Design System Tokens
All interactive surfaces must use the hardened design language:
- **Glassmorphism**: Use `backdropFilter: 'blur(10px)'` with low-opacity white backgrounds (`rgba(255, 255, 255, 0.02)`) and `1px` borders.
- **Gradients**: Leverage Mantine's `gradient` variant for `ThemeIcon` and `Button` to ensure a high-yield aesthetic.
- **Allowed Colors**: `blue`, `indigo`, `teal`, `violet`, `cyan`, `orange`, `brand`.

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
*   [x] **v0.15.0**: **Architectural Hardening (Mantine-First & Metadata Purity).**
*   [ ] **v1.0.0**: Multi-agent tournament judging & Executive Summary synthesis.
*   [ ] **v1.2.0**: Recurrent Kanban Intelligence & Strategic Learning.
*   [ ] **v1.4.0**: Recursive Deliberation (Multi-pass Evaluator) & Autonomous Budget Forecasting.

*Built for the Strategic Operator.*

# 🌌 CHECKLIST
> **The Autonomous Recurrent Layer for Strategic Intelligence.**

**v0.15.0: Production Architecture**

**CHECKLIST** is a high-performance, private-first autonomous intelligence system. It implements the **Recurrent-Depth Transformer (RDT)** philosophy at the agent level, bridging the gap between raw market evidence and executive strategy through iterative self-refinement.

---

## 🏛️ Core Philosophy: Total Independence
**CHECKLIST** operates as a hardened, standalone strategic asset, enforcing data sovereignty through local inference.

1.  **Recurrent Reasoning (RDT Engine)**: The Drafter agent now processes intelligence in three computational phases (**Prelude, Recurrence, Coda**), anchoring every loop with raw evidence injection to prevent hallucination.
2.  **Tactical Kanban Orchestration**: A 5-column tactical board (**Idea Bank → Roadmap → Backlog → Todo → Checklist**) automatically organizes tasks based on canonical `1-10` ICE metrics (`impact`, `confidence`, `ease`) with shared normalization.
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
The system automatically distributes taskcards across five tactical horizons based on their canonical **ICE Score**:

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
*   **Queueing**: Periodic rescoring and true refinement/update loops process oldest-updated items first to avoid starvation.

---

## 📐 Technical Standards & Design System
To maintain the premium experience and ensure system stability, follow these architectural constraints:

### 1. Mantine-Only Mandate
The repository enforces a strict Mantine-only architecture.
- **NO Tailwind Utilities**: Do not use ad-hoc Tailwind classes for layout or styling. 
- **Component Primitives**: Always use Mantine `Stack`, `Group`, `Box`, `Paper`, and `Card` for structural layout.
- **Visual Consistency**: All components must adhere to the hardened design tokens (glassmorphism, vibrant gradients, and blur filters).

### 2. Unified Grid Architecture
All strategic and tactical layers must implement the shared layout primitives found in `@/components/ui/app-shell`.
- **`PageShell`**: Standardized viewport-aware container.
- **`UnifiedGrid`**: Automatic 3-column desktop / 1-column mobile responsive grid.
- **`RouteCardGrid`**: Standard 6-column desktop grid for the six core route cards on company overview and Operation Unit dashboard surfaces.

### 3. Intelligence Clarity (Metadata Filtering)
End-user displays must be purged of technical trace information.
- **Boundary Rule**: Technical metadata must be stripped both on render and at persistence boundaries for user-authored text.
- **Filtering Utility**: Use `stripTechnicalMetadata()` for display and `sanitizeUserFacingText()` / `sanitizeOptionalUserFacingText()` for user-facing input and storage paths.
- **Markers Purged**: `[TRACE:...]` and `[TOPIC_ID:...]` are strictly technical metadata and must remain invisible to the end user or stored user-facing feedback.

### 4. Canonical Scoring Contract
- **Scale**: `impact`, `confidence`, `ease`, and `weight` are normalized to strict integers on a `1-10` boundary.
- **Task ICE**: `impact * confidence * ease`, yielding a `1-1000` range.
- **Knowledge/Goal ICE**: Derived from the same normalized base metrics through the shared scoring contract.
- **Grounding Rule**: Task generation and refinement must route through `@/lib/scoring-contract` rather than trusting repeated raw tuples.
- **Observability Rule**: Score clustering must be monitored through the shared score-health analyzer and `npm run audit:score-health`.
- **Health Contract**: Exact score share above `8%` is suspicious and above `12%` is critical; exact tuple share above `3%` is suspicious and above `8%` is critical.
- **Diversity Contract**: Unique tuple ratio below `20%` is suspicious and below `10%` is critical.

### 5. Surface Ordering Contract
- **Knowmore**: Rank cards from highest ICE to lowest ICE.
- **Goals**: Rank cards from highest ICE to lowest ICE.
- **Checklist**: Rank cards from highest ICE to lowest ICE.
- **Planning**: Human-managed tactical order. AI places new or refreshed cards initially, then the user’s tactical moves take precedence.
- **HITL Rule**: Manual Planning reorders are first-class teaching signals and must persist across refreshes and AI cycles.
- **Planning Teaching Rule**: Moving a task across at least two tactical horizons teaches the task scorer. Earlier moves increase `confidence` by `2` and `impact` by `1`; later moves decrease `confidence` by `2` and `impact` by `1`.
- **Rescore Queue Rule**: Human-taught planning moves reset the task into the oldest-first rescore queue by clearing `lastAuditedAt`, so canonical recalculation resumes from the oldest modified cards first.

### 6. Premium Design System Tokens
All interactive surfaces must use the hardened design language:
- **Glassmorphism**: Use `backdropFilter: 'blur(10px)'` with low-opacity white backgrounds (`rgba(255, 255, 255, 0.02)`) and `1px` borders.
- **Gradients**: Leverage Mantine's `gradient` variant for `ThemeIcon` and `Button` to ensure a high-yield aesthetic.
- **Allowed Colors**: `blue`, `indigo`, `teal`, `violet`, `cyan`, `orange`, `brand`.

### 7. Card Permalink Contract
- **UUID Route**: First-class cards are shareable by UUID at `/card/[cardId]`.
- **Standalone Surface**: The permalink route renders a single non-interactive landing page for the card, without operational action controls.
- **Share Action**: Share controls must copy the canonical UUID permalink, not raw card text or an app-local route fragment.
- **Layout Rule**: Share actions must use icon-only affordances to preserve one-line card action rows.

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
*   [x] **v0.15.0**: **Architectural Hardening (Mantine-Only & Metadata Purity).**
*   [ ] **v1.0.0**: Multi-agent tournament judging & Executive Summary synthesis.
*   [ ] **v1.2.0**: Recurrent Kanban Intelligence & Strategic Learning.
*   [ ] **v1.4.0**: Recursive Deliberation (Multi-pass Evaluator) & Autonomous Budget Forecasting.

*Built for the Strategic Operator.*

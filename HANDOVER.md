# CHECKLIST - v0.15.0 Hardening Handover

## System Status: STABLE ✅
- **Current Version**: v0.15.0
- **Primary Design**: Mantine-Only (Hardened)
- **UI State**: Architecturally Pure & Visually Synchronized
- **Trinity Pipeline**: 100% Build-Stable and Production-Ready

## Shipped in this Session (v0.15.0)

### 1. Architectural Restoration (Mantine-Only)
- **Mandatory Mantine Migration**: Purged 100% of legacy Tailwind utility fragments and Shadcn components across ALL core layers:
    - **Data Ingress** (Source Data)
    - **Topics** (Strategic Priorities)
    - **Knowmore** (Knowledge Layer)
    - **Goals** (Strategic Objectives)
    - **Checklist** (Tactical Layer)
    - **Tactical Board** (Execution Layer)
    - **Review Gateway** (Manual Audit Loop)
- **Unified Component Architecture**: Standardized all intelligence layers on `PageShell` and `UnifiedGrid` primitives.

### 2. Premium Design Unification
- **High-Yield Glassmorphism**: Implemented `backdrop-filter: blur` and low-opacity white tokens for a premium strategic aesthetic.
- **Dynamic Gradients**: Integrated vibrant, brand-aligned gradients across the dashboard, metrics, and navigation units.
- **Branding Synchronization**: Completed a recursive audit and purge of all legacy "Sovereign" nomenclature, finalizing the **CHECKLIST** identity.

### 3. Intelligence Clarity (Metadata Filtering)
- **Hardened Presentation Layer**: Implemented `stripTechnicalMetadata()` utility to keep implementation details invisible to users.
- **Boundary Sanitization**: Added persistence-safe sanitizers so technical trace data is removed from feedback and annotations before storage, not only before render.
- **Purged Markers**: Technical trace data (`[TRACE:...]`, `[TOPIC_ID:...]`) is now strictly internal and filtered from all user-facing cards and user-facing annotation fields.

### 4. Canonical Scoring & Queueing
- **Shared Scoring Contract**: `src/lib/scoring-contract.js` is now the authoritative contract for normalized `1-10` metrics and derived ICE values.
- **Evidence-Grounded Task Scoring**: Task generation/refinement no longer relies on raw repeated tuples alone; scores are grounded by source strength plus task specificity, urgency, and complexity signals.
- **Fairness Rule**: Periodic rescoring and true refinement queues run oldest-updated-first to avoid starvation.
- **Observability Surface**: Dashboard score-health metrics now expose tuple repetition, ICE diversity, and dominant clustering surface per company.
- **Audit Job**: `npm run audit:score-health -- <companyId>` runs the same analyzer from the command line for targeted diagnosis.
- **Alert Contract**: Shared score-health thresholds are now explicit and machine-readable: exact score share `>8%` is suspicious / `>12%` critical, exact tuple share `>3%` suspicious / `>8%` critical, and unique tuple ratio `<20%` suspicious / `<10%` critical.

### 5. Tactical Board Drag Stability
- **Drag Lifecycle Fix**: Tactical board drag visuals are now tied to explicit drag lifecycle state instead of lingering per-card transforms.
- **Invariant**: After drop, cards must immediately return to resting style without requiring a refresh.

### 6. Surface Ordering Contract
- **Knowmore / Goals / Checklist**: These are ranked AI surfaces and must display cards from highest ICE to lowest ICE.
- **Planning**: This is the human-managed tactical board. AI performs initial placement for new or updated cards, but human tactical moves define the ongoing order/placement contract.
- **Teaching Importance**: Planning drag-and-drop order is a core HITL signal and is persisted as explicit per-column manual order, not a transient UI effect.
- **Scoring Feedback**: Planning moves across at least two horizons now teach task scoring directly. Earlier moves apply `+2 confidence` and `+1 impact`; later moves apply `-2 confidence` and `-1 impact`, then the task re-enters the oldest-first rescore queue through `lastAuditedAt = null`.

### 7. Card Sharing Contract
- **Canonical Link**: Card sharing now uses the card UUID as the canonical permalink key.
- **Standalone View**: `/card/[cardId]` renders a single-card landing page without interactive workflow buttons, suitable for focused sharing and review.
- **Shell Rule**: Shared card pages bypass the normal navigation shell and render as standalone content.
- **Control Rule**: Share actions are icon-only and copy the canonical permalink instead of raw card text.

## Open Gaps & Roadmap

| Priority | Feature | Status |
| :--- | :--- | :--- |
| **P1** | **Recursive Deliberation** | Planned for v1.6.0; multi-pass tournament judging for high-stakes decisions. |
| **P2** | **Source Diversity** | Planned: API/webhook ingestion and CRM integrations. |
| **P3** | **Autonomous Budgeting** | Future: Fiscal forecasting based on tactical execution velocity. |

## Maintenance & Standards
- **Coding Standard**: Strict **Mantine-Only** mandate; NO Tailwind utilities or parallel UI systems permitted.
- **UI Standard**: Premium glassmorphism and gradient tokens only.
- **Metadata Standard**: All end-user text must be processed via `stripTechnicalMetadata`.

---
*Signed, Antigravity*

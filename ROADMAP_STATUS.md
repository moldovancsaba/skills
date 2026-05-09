# CHECKLIST - Hardening Roadmap Status (v0.15.0)

## ✅ DELIVERED THIS SESSION (v0.15.0)

### UI Hardening & Unification (Mantine-Only)
- **Mantine-Only Restoration**: Purged 100% of legacy Tailwind utility classes and shadcn fragments from core pages (Data Ingress, Topics, Tactical Board, Knowmore, Goals, Checklist, and Review Gateway).
- **Premium Design Unification**: Hardened `MetricCard` and `LinkCard` with high-yield glassmorphism, vibrant gradients, and sophisticated micro-animations.
- **Unified Architecture**: Standardized strategic and tactical layers using the `PageShell` and `UnifiedGrid` patterns for total structural consistency.

### Intelligence Clarity & Purity
- **Global Metadata Filter**: Implemented `stripTechnicalMetadata()` utility to purge `[TRACE:...]` and `[TOPIC_ID:...]` markers from all end-user cards.
- **Boundary Hardening**: Added shared sanitizers for feedback and annotation persistence so technical markers cannot leak back into user-facing text state.
- **Taxonomy Hardening**: Applied the metadata filter across `TaskReviewCard`, `SourceDataCard`, and `KnowledgeReviewCard`, and action-form state seeding now strips technical metadata before display.

### Scoring & Refinement Foundations
- **Canonical Scoring Contract**: Introduced a shared scoring contract for normalized `1-10` metrics across tasks, goals, and knowledge.
- **Oldest-First Maintenance**: Periodic rescoring and true refinement/update queues now process oldest-updated items first.
- **General Task Score Grounding**: Task scoring now uses shared normalization plus evidence/task-shape signals instead of trusting repeated raw tuples.
- **Score Health Observability**: Added a shared score-health analyzer, a dashboard metric panel, and `audit:score-health` CLI reporting for per-company score clustering.

### Tactical Board Stability
- **Drag-State Cleanup**: Fixed the tactical board so drag rotation/accent state clears immediately after drop instead of persisting until refresh.

### Shareable Card Permalinks
- **UUID Card Routes**: Added canonical `/card/[cardId]` share routes for first-class cards.
- **Standalone Landing Page**: Shared cards now render as non-interactive single-card pages outside the main app shell.
- **Icon-Only Share Controls**: Card share affordances now use icon-only controls to preserve stable one-line actions.

### Technical Foundations
- **Build-Time Stability**: Validated 100% stable `next build` across the new Mantine architecture.
- **Versioning**: Bumped repository to v0.15.0, reflecting the hardened, production-ready state.
- **Documentation Sync**: Synchronized `README.md`, `brain.md`, and technical specs with the new Mantine-only methodology.

---

## 🚀 COMPLETED NEXT BEST ACTIONS (NBAs)

1. **Mantine-Only UI Restoration & Unification** [DELIVERED]
2. **Global Metadata Filtering Implementation** [DELIVERED]
3. **Production Build Validation & Branding Sync** [DELIVERED]

---

## 🔴 PENDING / FUTURE PIPELINE

### Source Diversity
- [ ] **#73 API/webhook ingestion**: Direct programmatic intake.
- [ ] **#74 CRM integrations**: External context harvesting.

### Advanced Intelligence
- [ ] **v1.6.0 Recursive Deliberation**: Multi-pass tournament judging for high-stakes decisions.
- [ ] **Autonomous Budgeting**: Fiscal forecasting based on tactical execution velocity.

---
*Status Update: 2026-05-09. Project Board Synchronized (multi-theme, scoring, metadata, and tactical-board hardening).*

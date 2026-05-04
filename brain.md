# CHECKLIST BRAIN: Memory & Strategic Alignment

This file serves as the long-term cognitive anchor for Antigravity (the AI assistant) to ensure continuity, minimize "dumb" mistakes, and maintain strict adherence to the CHECKLIST architecture.

## 🧠 Core Axioms
1. **APERTUS Purity**: 100% monolingual content. No mixed-language cards. Delete without hesitation if violated.
2. **Provenance is King**: Every Flashcard/Task MUST link back to a Source. No "hallucinated" intelligence.
3. **Trinity Serial Lock**: AI inference is sequential to protect local hardware (Ollama).
4. **Threshold-Based Synthesis**: Pivot to enrichment if ratios exceed 10x (Flashcards) or capacity exceeds 50 (Tasks).

## 🛠️ Operational State
- **Current Milestone**: v0.14.0 (UI Hardening)
- **Database**: Prisma + MongoDB Atlas.
- **AI Stack**: Local Ollama (llama3.2:3b).
- **Security**: Google Auth + Multi-Tenant isolation.

## 🎯 Next Strategic Priorities (from GitHub)
1. **#111: Topics as Primary Planning Layer**: Refactor the synthesis loop to prioritize TopicCard context over raw DataCard flow.
2. **#113: Freshness Decay**: Implement auto-archiving or re-validation for cards older than X days.
3. **#115: Runtime Consistency**: Ensure the `sync.js` and `synthesis.js` logic are strictly unified (Elemental Cycle).
4. **#112: Research Harvest Yield**: Improve the `research.js` (if active) to target strategic keywords more effectively.

## 🚫 Avoid / Anti-Patterns
- Never use `cd` in terminal commands.
- Never use TailwindCSS unless explicitly requested; stick to Vanilla CSS.
- Do not use placeholders; use `generate_image` or real data.
- Avoid generic UI; prioritize "Wowed at first glance" aesthetics.

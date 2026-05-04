# CHECKLIST BRAIN: Memory & Strategic Alignment

This file serves as the long-term cognitive anchor for Antigravity (the AI assistant) to ensure continuity, minimize "dumb" mistakes, and maintain strict adherence to the CHECKLIST architecture.

## 🧠 Core Axioms
1. **APERTUS Purity**: 100% monolingual content. No mixed-language cards. Delete without hesitation if violated.
2. **Provenance is King**: Every Flashcard/Task MUST link back to a Source. No "hallucinated" intelligence.
3. **Mantine-First Mandate**: 100% architectural purity. No Tailwind utility classes. Use only Mantine primitives and hardened design tokens (glassmorphism/gradients).
4. **Metadata Purity**: User-facing cards must be purged of technical trace data (use `stripTechnicalMetadata`).
5. **Trinity Serial Lock**: AI inference is sequential to protect local hardware (Ollama).

## 🛠️ Operational State
- **Current Milestone**: v0.15.0 (Architectural Restoration)
- **Database**: Prisma + MongoDB Atlas.
- **AI Stack**: Local Ollama (llama3.2:3b).
- **Security**: Google Auth + Multi-Tenant isolation.

## 🎯 Next Strategic Priorities (from GitHub)
1. **#111: Topics as Primary Planning Layer**: Refactor the synthesis loop to prioritize TopicCard context over raw DataCard flow.
2. **#113: Freshness Decay**: Implement auto-archiving or re-validation for cards older than X days.
3. **#112: Research Harvest Yield**: Improve the `research.js` (if active) to target strategic keywords more effectively.

## 🚫 Avoid / Anti-Patterns
- Never use `cd` in terminal commands.
- **Never use TailwindCSS utility classes** (hardened mandate).
- Do not use placeholders; use `generate_image` or real data.
- Avoid generic UI; prioritize "Wowed at first glance" aesthetics.

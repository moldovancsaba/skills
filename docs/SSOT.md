# Checklist Product: System Operating Model (SSOT)

## 1. Product Purpose
This is a sovereign, continuously operating card intelligence system.
Its function is to turn raw user input into structured, decision-ready business knowledge with minimal or no human intervention.

The system must run as a full-cycle autonomous workflow on a local AI server, synchronising with the online application and database. It must be resilient, restartable, and designed to operate reliably without manual babysitting.

**Guiding principle:** Done is better than perfect.

---

## 2. Core Concept: The Card Model
The whole product is built around cards. A card is the smallest useful unit of business intelligence.

### Card Types
- **DataCard**: Raw input captured from the user or ingested from external material (URLs, text, files). Starting point.
- **FlashCard**: A structured intelligence unit derived from one or more DataCards. Represents a fact, insight, or pattern.
- **TaskCard**: An actionable unit derived from one or more FlashCards. Represents a task, follow-up, or decision-support action.

---

## 3. Deployment Model
- **Online Web Application**: User-facing layer. Receives input, stores cards/logs/feedback, displays states.
- **Local AI Server**: Autonomous processing engine. Periodically runs the loop, pulls data, updates memory, generates cards, pushes results back.

---

## 4. High-Level Operating Principle
The system runs in a continuous loop. For each cycle:
1. Load active companies.
2. Select the next company fairly (oldest last-visited).
3. Pull new data and feedback.
4. Teach local memory from all user feedback.
5. Process cards through the agent pipeline.
6. Update statuses, age labels, and expirations.
7. Push results back to the online database.
8. Continue with the next company.

---

## 5. Company Rotation Logic
- **Rule:** Oldest last-visited company first.
- Every active company participates in the same rotating queue to avoid starvation.

---

## 6. Continuous System Loop (Detailed Steps)
- **Step 1: Load companies** (active from DB).
- **Step 2: Load runtime configuration** (No hardcoded operational thresholds).
- **Step 3: Select company** (oldest AI visit timestamp).
- **Step 4: Pull new remote data** (DataCards, updates, feedback, moderation).
- **Step 5: Build or refresh DataCards** (convert raw material).
- **Step 6: Teach the local brain** (Feedback = strong learning material).
- **Step 7: Run card-processing mini-loop** (agent pipeline).
- **Step 8: Update ageing and expiration** (apply labels).
- **Step 9: Push back to online database**.
- **Step 10: Mark company processed** (update last-visited timestamp).
- **Step 11: Move to next company**.

---

## 7. Mini-Loop: Card Production and Promotion
Runs **N** times per company per cycle (N is configurable, default = 3).

### Stages
- **A. Drafter: DataCard -> FlashCard**: Generates DRAFT FlashCards from DataCards.
- **B. Drafter: FlashCard -> TaskCard**: Generates DRAFT TaskCards from FlashCards.
- **C/D. Writer: DRAFT -> CHECKED**: Refines, de-duplicates, and validates cards using research/memory.
- **E/F. Judge: CHECKED -> VERIFIED**: Final verification against quality floor; detects hallucinations/contractions.

---

## 8. Agent Responsibilities
- **Drafter**: Responsible for generation (Data -> Flash, Flash -> Task). Creates only DRAFT cards.
- **Writer**: Responsible for refinement and enrichment. Promotes to CHECKED.
- **Judge**: Responsible for verification and gatekeeping. Promotes to VERIFIED. Final quality gate.

---

## 9. Status Model (Option B)
Separate fields for workflow and ageing:
- **processing_status**: DRAFT / CHECKED / VERIFIED / DECLINED / ACCEPTED
- **activity_state**: ACTIVE / STALE / EXPIRED / ARCHIVED

---

## 10. Age Labels and Inactivity Handling
Based on "meaningful touch" (refined, rewritten, checked, verified, etc.):
- **ACTIVE**: Touched recently.
- **STALE**: No touch for 30 days.
- **ARCHIVED**: No touch for 90 days.

**Reactivation Rule:** User-reactivated archived cards reset to ACTIVE (activity) and DRAFT (status).

---

## 11. Expiration Rule
- **EXPIRED**: No touch for 168 hours (7 days). Short-term operational inactivity.

---

## 12. Confidence Model and Quality Floor
- Every transition carries a confidence score.
- **Rule:** Accepted only if confidence is NOT below the configured lower-percentile threshold of its comparison group.
- **Threshold**: Configurable from settings (e.g., 10th percentile), not hardcoded.
- **Comparison Groups**: Must match (e.g., FlashCards vs FlashCards).

---

## 13. Lifecycle Outcome Model
- **decision_status**: NONE / ACCEPTED / DECLINED
- **processing_status**: DRAFT / CHECKED / VERIFIED
- **activity_state**: ACTIVE / EXPIRED / STALE / ARCHIVED

---

## 14. Feedback as Hard Knowledge
- Every feedback event (positive/negative) is structural teaching material.
- Must be embedded in memory/RAG/rules.
- Directly influences future agent behavior.

---

## 15. Reliability and Watchdog
- Detect frozen states, restart broken pipelines, relaunch failed workers.
- Log recovery actions. Durable processing engine.

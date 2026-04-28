# checklist Card Workflow (v0.10.0-PROPER)

This document defines the rigid architecture of the checklist. Every piece of information in this system is treated as a **CARD**.

## 1. The Card Hierarchy (Mapping & Lineage)

To ensure **Safety First** and database stability, we maintain stable model names in the DB while using "Proper" Card nomenclature in the logic and UI:

| Card Term | Prisma Model | Strategic Definition |
| :--- | :--- | :--- |
| **TopicCard** | `Topic` | Defines strategic focus (PESTEL, ICP). |
| **DataCard** | `Source` | Raw ingested information or AI web logs. |
| **FlashCard** | `Flashcard` | Synthesized intelligence (KnowMore). |
| **TaskCard** | `NBAItem` | Actionable checklist items (checklist). |

## 2. The trinity Quality Gate

To ensure "Proper" and "Brutally Honest" intelligence, every card must pass through three distinct AI agents:

1.  **Stage 1: DRAFTER**
    *   **Input**: DataCard (Source Content) + TopicCard (Labels).
    *   **Action**: Proposes initial intelligence and identifies or **invents** an evolutionary "Kind."
    *   **Status**: `DRAFT` (Chip: DRAFT).

2.  **Stage 2: WRITER**
    *   **Input**: `DRAFT` FlashCard/TaskCard.
    *   **Action**: Refines for tone and **improves the "Kind"** name for better strategic grouping.
    *   **Status**: `CHECKED` (Chip: CHECKED).

3.  **Stage 3: JUDGE**
    *   **Input**: `CHECKED` Card.
    *   **Action**: Audits quality. Either verifies or demotes.
    *   **Status**: `VERIFIED` (Chip: VERIFIED).

## 3. Evolutionary Kinds (Enrichment)

The `kind` field is an **Evolutionary Meta-Tag**. 

*   **System Enrichment**: If a new category of intelligence is discovered (e.g., `MARKET_GAP`, `CONVERSION_LEAK`), the AI is authorized to create that category name autonomously.
*   **Greater Good**: This allows the system to growing beyond its initial code to self-organize the intelligence dashboard into new, professional groups.

## 4. The Heavy Teaching Loop (checklist Memory)

Every human interaction—**Accept**, **Decline**, or **Annotate**—is a high-integrity teaching signal.

*   **Persistence**: Feedback is stored in `FlashcardAction` and `Feedback` history logs.
*   **Harvesting**: The Memory Engine scavenges these history logs during every trinity pass.

## 5. Zero Hardcoding (Worker Config)

All numeric thresholds (Confidence, Impact, Expiration) are stored in the `Company.workerConfig` JSON field.

*   **Default Expiration**: 168 Hours (7 Days).

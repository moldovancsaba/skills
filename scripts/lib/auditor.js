/**
 * TRINITY AUDITOR (Intelligence Purifier)
 * M4.1 — Self-Correcting Intelligence (SCI) Layer
 * v1.0.0
 * 
 * Responsibilities:
 *   - Probes existing cards for Tri-Layer taxonomy purity.
 *   - Identifies mismatches between content and layer (Knowledge, Goal, Task).
 *   - Provides suggested re-classification and refinement guidance.
 */

const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { getStageModels } = require("./core");

/**
 * Audits a card's content to verify its taxonomy classification.
 * 
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {object} card - Flashcard, Goalcard, or NBAItem
 * @param {string} currentLayer - "KNOWLEDGE" | "GOAL" | "TASK"
 * @returns {object|null} Audit result { suggestedLayer, confidence, reasoning, refinementPlan }
 */
async function auditCardTaxonomy(prisma, company, card, currentLayer) {
  const systemPrompt = [
    "You are the TRINITY AUDITOR. Your goal is to ensure 'Taxonomy Purity' in the company's intelligence layers.",
    "The Tri-Layer Architecture consists of:",
    "  1. KNOWLEDGE (Flashcard): Facts, capabilities, or research findings (What the company IS/DOES).",
    "  2. GOAL (Goalcard): Strategic objectives, milestones, or aspirational states (What the company WANTS).",
    "  3. TASK (Taskcard): Specific actionable directives or execution steps (What the company MUST DO).",
    "",
    "### [AUDIT AXIOMS]",
    "- A 'Goal' is NOT a 'Task'. A goal describes an outcome (e.g., 'Achieve Market Dominance'); a task describes a move (e.g., 'Draft social media schedule').",
    "- A 'Fact' is NOT a 'Goal'. A fact is a current capability or truth (e.g., 'Company has 500 employees'); a goal is a future state.",
    "- A 'Directive' is a Task. If it starts with a verb and is executable, it is a TASK.",
    "",
    "Your task is to review the provided card and determine if it is in the correct layer.",
    "Return a JSON object with:",
    "  - 'suggestedLayer': 'KNOWLEDGE', 'GOAL', or 'TASK'.",
    "  - 'confidence': 1-10 integer score of your certainty.",
    "  - 'reasoning': Brief explanation of why it fits that layer.",
    "  - 'refinementPlan': If the content is slightly muddled, suggest how to rewrite it to perfectly fit the suggestedLayer.",
    "Format: JSON only."
  ].join("\n");

  const cardContent = `
Current Layer: ${currentLayer}
Title: ${card.title}
Body/Description: ${card.body || card.description || card.generatedBody || ""}
  `.trim();

  const userPrompt = `Review this intelligence unit for Company: ${company.name}\n\n[CARD CONTENT]\n${cardContent}`;

  const modelList = await getStageModels(prisma, "JUDGE", company);
  
  try {
    const result = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: 30000 });
    
    if (result && result.suggestedLayer) {
      return {
        ...result,
        isMismatch: result.suggestedLayer !== currentLayer
      };
    }
  } catch (e) {
    console.error(`[AUDITOR] Audit failed for card ${card.id}:`, e.message);
  }
  
  return null;
}

module.exports = {
  auditCardTaxonomy
};

const { truncate } = require("./shared");

/**
 * SOVEREIGN STRATEGIC CONTEXT
 * v0.11.4-STABLE
 * 
 * Orchestrates the "Strategic Stack" for AI agents.
 * Aggregates TopicCards, recent verified Flashcards, and active TaskCards into a unified context prompt.
 */
/**
 * Builds a comprehensive strategic prompt containing the company's focus, recent insights, and existing tasks.
 * Ensures the AI remains aligned with the 'TopicCard' strategic layer.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {string} companyId - Unique company identifier
 * @returns {Promise<string>} Formatted strategic context prompt
 */
async function getCompanyStrategicContext(prisma, companyId) {
  // 0. Load Company Strategy (Languages)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { allowedLanguages: true }
  });
  const allowedLangs = company?.allowedLanguages || ["English"];

  // 1. Load TopicCards (The Strategy)
  const topics = await prisma.topic.findMany({
    where: { companyId, active: true },
    orderBy: { sortOrder: "asc" }
  });

  // 2. Load Verified Flashcards (The Intelligence)
  const recentInsights = await prisma.flashcard.findMany({
    where: { companyId, processingStatus: "VERIFIED" },
    take: 10,
    orderBy: { updatedAt: "desc" }
  });

  // 3. Load Active Tasks (To avoid duplication)
  const activeTasks = await prisma.nBAItem.findMany({
    where: { companyId, processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] } },
    take: 10,
    orderBy: { updatedAt: "desc" }
  });

  // 4. Format the Context Prompt
  let prompt = "--- RELATED STRATEGIC CONTEXT ---\n";
  prompt += `[Allowed Languages Policy]: AI MUST ONLY generate output in: ${allowedLangs.join(", ")}\n`;
  
  if (topics.length > 0) {
    prompt += "\n[TopicCards / Strategic Focus]:\n";
    topics.forEach(t => {
      prompt += `- ${t.label}: ${t.notes || "No notes."}\n`;
    });
  }

  if (recentInsights.length > 0) {
    prompt += "\n[FlashCards / Verified Intelligence]:\n";
    recentInsights.forEach(i => {
      prompt += `- ${i.title}: ${truncate(i.body, 300)}\n`;
    });
  }

  if (activeTasks.length > 0) {
    prompt += "\n[TaskCards / Existing Checklist]:\n";
    activeTasks.forEach(t => {
      prompt += `- ${t.title}: ${truncate(t.description || "", 200)}\n`;
    });
  }

  if (prompt === "--- RELATED STRATEGIC CONTEXT ---\n") {
    return "No related cards found. This is a clean strategic slate.";
  }

  return prompt;
}

module.exports = {
  getCompanyStrategicContext
};

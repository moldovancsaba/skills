const { truncate } = require("./shared");

/**
 * Loads the "Strategic Stack" for a company.
 * Fetches Related Assets (Topics, Flashcards, Tasks) to provide AI agents with full context.
 * Aligned with Sovereign Architecture v0.11.3-PRODUCTION.
 */
async function getCompanyStrategicContext(prisma, companyId) {
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

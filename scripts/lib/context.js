const { truncate } = require("./shared");
const { humanReadableAllowedLanguages, getLanguagePolicyPrompt } = require("./language-validator");

/**
 * checklist STRATEGIC CONTEXT
 * v1.2.0-PRODUCTION
 * 
 * Orchestrates the "Strategic Stack" for AI agents.
 * Harvests user-defined tactical priorities from the Kanban board (sortOrder < 0)
 * to steer the Trinity pipeline towards user-indicated focus areas.
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
  const readableAllowedLangs = humanReadableAllowedLanguages(allowedLangs);

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

  // 3. Load Active Tasks & Manual Priorities (§24 - Strategic Learning)
  const prioritizedTasks = await prisma.nBAItem.findMany({
    where: { 
      companyId, 
      sortOrder: { lt: 0 },
      activityState: { in: ["ACTIVE", "STALE"] }
    },
    take: 10,
    orderBy: { sortOrder: "asc" } // highest priority (most negative) first
  });

  const activeTasks = await prisma.nBAItem.findMany({
    where: { 
      companyId, 
      kanbanColumn: { in: ["CHECKLIST", "TODO"] },
      activityState: { in: ["ACTIVE", "STALE"] }
    },
    take: 10,
    orderBy: { updatedAt: "desc" }
  });

  // 4. Format the Context Prompt
  let prompt = "--- RELATED STRATEGIC CONTEXT ---\n";
  prompt += `[Allowed Languages Policy]: AI MUST ONLY generate output in: ${readableAllowedLangs.join(", ")}\n`;
  prompt += `[Output Language Mandate]: ${getLanguagePolicyPrompt(allowedLangs)}\n`;
  
  if (topics.length > 0) {
    prompt += "\n[TopicCards / Strategic Focus]:\n";
    topics.forEach(t => {
      prompt += `- ${t.label}: ${t.notes || "No notes."}\n`;
    });
  }

  if (prioritizedTasks.length > 0) {
    prompt += "\n[USER-DEFINED PRIORITIES / HARD FEEDBACK]:\n";
    prompt += "The user has explicitly prioritized these items manually. FOCUS ON THESE THEMES:\n";
    prioritizedTasks.forEach(t => {
      prompt += `- [HIGH PRIORITY] ${t.title}: ${truncate(t.description || "", 200)} (Tags: ${t.hashtags.join(", ")})\n`;
    });
  }

  if (recentInsights.length > 0) {
    prompt += "\n[FlashCards / Verified Intelligence]:\n";
    recentInsights.forEach(i => {
      prompt += `- ${i.title}: ${truncate(i.body, 300)}\n`;
    });
  }

  if (activeTasks.length > 0) {
    prompt += "\n[TaskCards / Current Tactical Pipeline]:\n";
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

const { callOllamaJson } = require("./ai");
const { getCompanyStrategicContext } = require("./context");
const { getWorkerConfig, calculatePercentile } = require("./shared");

/**
 * The JUDGE is the final stage of the Trinity Quality Gate.
 * it audits CHECKED cards and either promotes to VERIFIED or demotes to DRAFT.
 * Rejections forcefully crater all metrics to 1 to ensure they sink to the bottom of sorting layers.
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  // 1. Identify Quality Floor (Percentile)
  const percentile = await getWorkerConfig(prisma, {}, "confidence_reject_percentile", 10);
  const existingScores = (await prisma.flashcard.findMany({
    where: { companyId: flashCard.companyId, processingStatus: "VERIFIED" },
    select: { confidenceScore: true }
  })).map(f => f.confidenceScore);

  let threshold = 60; // Bootstrap floor
  if (existingScores.length >= 10) {
    threshold = calculatePercentile(existingScores, percentile);
  }

  const systemPrompt = [
    "You are the Checklist JUDGE. Your goal is to audit FlashCards for high-quality marketing standards.",
    "Required decision: VERIFIED or REJECTED.",
    "Criteria: Internal coherence, de-duplication, contradiction risk, hallucination check.",
    "Strategic context:",
    strategicContext,
    "Return a SINGLE JSON object with: decision, confidenceScore, reason.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.decision) return { processingStatus: "CHECKED" }; 

  const finalScore = parseFloat(raw.confidenceScore) || flashCard.confidenceScore || 50;

  if (raw.decision === "VERIFIED" && finalScore >= threshold) {
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Legacy Sync
      confidenceScore: finalScore, 
      activityState: "ACTIVE" 
    };
  } else {
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Legacy Sync
      confidenceScore: 1, // Crater scores to sink to the bottom of the list
      impact: 1,
      weight: 1,
      userAnnotation: `[JUDGE REJECTION]: ${raw.reason || "Confidence below quality floor."}` 
    };
  }
}

async function auditCheckedTaskCard(prisma, taskCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);

  // Quality Floor
  const percentile = await getWorkerConfig(prisma, {}, "confidence_reject_percentile", 10);
  const existingScores = (await prisma.nBAItem.findMany({
    where: { companyId: taskCard.companyId, processingStatus: "VERIFIED" },
    select: { confidenceScore: true }
  })).map(f => f.confidenceScore);

  let threshold = 60;
  if (existingScores.length >= 10) {
    threshold = calculatePercentile(existingScores, percentile);
  }

  const systemPrompt = [
    "You are the Checklist JUDGE. Audit this TaskCard for actionable quality.",
    "Required decision: VERIFIED or REJECTED.",
    "Strategic context:",
    strategicContext,
    "Return a SINGLE JSON object with: decision, confidenceScore, reason.",
    // memoryPrompt is ignored here locally if not needed but included for signature parity
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${taskCard.title}\nDescription: ${taskCard.description}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.decision) return { processingStatus: "CHECKED" };

  const finalScore = parseFloat(raw.confidenceScore) || taskCard.confidenceScore || 50;

  if (raw.decision === "VERIFIED" && finalScore >= threshold) {
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Legacy Sync
      confidenceScore: finalScore, 
      activityState: "ACTIVE" 
    };
  } else {
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Legacy Sync
      confidenceScore: 1, // Crater scores to sink to the bottom of the list
      impact: 1,
      ease: 1,
      iceScore: 1,
      userAnnotation: `[JUDGE REJECTION]: ${raw.reason || "Confidence below quality floor."}`
    };
  }
}

module.exports = {
  auditCheckedFlashCard,
  auditCheckedTaskCard
};

/**
 * SOVEREIGN JUDGE
 * v0.11.4-STABLE
 * 
 * The final quality gate of the Trinity Synthesis pipeline.
 * Audits CHECKED cards and determines if they meet the threshold for promotion to VERIFIED.
 * Rejections are demoted to DRAFT with cratered scores to sink in sorting layers.
 */
const { callOllamaJson } = require("./ai");
const { getCompanyStrategicContext } = require("./context");
const { getWorkerConfig, calculatePercentile } = require("./shared");

// --- AUDITING ENGINE ---

/**
 * Audits a CHECKED Flashcard and determines its promotion path.
 * Uses a dynamic quality floor based on the percentile distribution of existing scores.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} flashCard - CHECKED flashcard record
 * @param {string} memoryPrompt - Contextual AI memory injection
 * @returns {Promise<object>} Audit decision updates
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
      status: "VERIFIED", // Internal Sync
      confidenceScore: finalScore, 
      activityState: "ACTIVE" 
    };
  } else {
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Internal Sync
      confidenceScore: 1, // Crater scores to sink to the bottom of the list
      impact: 1,
      weight: 1,
      userAnnotation: `[JUDGE REJECTION]: ${raw.reason || "Confidence below quality floor."}` 
    };
  }
}

/**
 * Audits a CHECKED Taskcard (NBA) and determines its promotion path.
 * Enforces quality standards for strategic tactical recommendations.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} taskCard - CHECKED taskcard record
 * @param {string} memoryPrompt - Contextual AI memory injection
 * @returns {Promise<object>} Audit decision updates
 */
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
    const ice = taskCard.impact * (finalScore / 10) * taskCard.ease;
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Internal Sync
      confidenceScore: finalScore, 
      iceScore: Math.round(ice * 10) / 10,
      activityState: "ACTIVE" 
    };
  } else {
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Internal Sync
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

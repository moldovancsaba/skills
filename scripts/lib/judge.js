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
const { getWorkerConfig, calculatePercentile, parseBoundedInt } = require("./shared");
const { unifyObject } = require("./synthesis-utils");

// --- AUDITING ENGINE ---

/**
 * Audits a CHECKED Flashcard and determines its promotion path.
 * Uses a dynamic quality floor based on the percentile distribution of existing scores.
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  // 1. Identify Quality Floor (Percentile)
  const percentile = await getWorkerConfig(prisma, {}, "confidence_reject_percentile", 10);
  const existingScores = (await prisma.flashcard.findMany({
    where: { companyId: flashCard.companyId, processingStatus: "VERIFIED" },
    select: { confidenceScore: true }
  })).map(f => f.confidenceScore);

  let threshold = 6; // Bootstrap floor on 1-10 scale
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
    "SOVEREIGN AXIOM: confidenceScore MUST be a strictly integer from 1 to 10.",
    `IMPORTANT: Since the company is "magyar nyelv" or related content is in Hungarian, you MUST generate the reasoning in Hungarian.`,
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;

  const res = await callOllamaJson(systemPrompt, userPrompt);
  const raw = unifyObject(res);
  if (!raw || !raw.decision) return { processingStatus: "CHECKED" }; 

  let finalScore;
  try {
    finalScore = parseBoundedInt(raw.confidenceScore, 1, 10);
  } catch(e) {
    // If the Judge refuses to score it properly, send to human review
    return {
      processingStatus: "REVIEW",
      confidenceScore: 1,
      confidence: 1
    };
  }

  if (raw.decision === "VERIFIED" && finalScore >= threshold) {
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Internal Sync
      confidenceScore: finalScore, 
      confidence: finalScore,
      activityState: "ACTIVE" 
    };
  } else {
    const reasonText = typeof raw.reason === "string" ? raw.reason : JSON.stringify(raw.reason);
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Internal Sync
      confidenceScore: 1, // Axiom 6/7: Complete degradation
      confidence: 1,
      weight: 1,
      activityState: "ARCHIVED", // Hide from active lists
      userAnnotation: `[JUDGE REJECTION]: ${reasonText || "Confidence below quality floor."}` 
    };
  }
}

/**
 * Audits a CHECKED Taskcard (NBA) and determines its promotion path.
 * Enforces quality standards for strategic tactical recommendations.
 */
async function auditCheckedTaskCard(prisma, taskCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);

  // Quality Floor
  const percentile = await getWorkerConfig(prisma, {}, "confidence_reject_percentile", 10);
  const existingScores = (await prisma.nBAItem.findMany({
    where: { companyId: taskCard.companyId, processingStatus: "VERIFIED" },
    select: { confidenceScore: true }
  })).map(f => f.confidenceScore);

  let threshold = 6;
  if (existingScores.length >= 10) {
    threshold = calculatePercentile(existingScores, percentile);
  }

  const systemPrompt = [
    "You are the Checklist JUDGE. Audit this TaskCard for actionable quality.",
    "Required decision: VERIFIED or REJECTED.",
    "Strategic context:",
    strategicContext,
    "Return a SINGLE JSON object with: decision, confidenceScore, reason.",
    "SOVEREIGN AXIOM: confidenceScore MUST be a strictly integer from 1 to 10.",
    `IMPORTANT: Since the company is "magyar nyelv" or related content is in Hungarian, you MUST generate the reasoning in Hungarian.`,
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${taskCard.title}\nDescription: ${taskCard.description}`;

  const res = await callOllamaJson(systemPrompt, userPrompt);
  const raw = unifyObject(res);
  if (!raw || !raw.decision) return { processingStatus: "CHECKED" };

  let finalScore;
  try {
    finalScore = parseBoundedInt(raw.confidenceScore, 1, 10);
  } catch(e) {
    return {
      processingStatus: "REVIEW",
      confidenceScore: 1,
      confidence: 1
    };
  }

  if (raw.decision === "VERIFIED" && finalScore >= threshold) {
    const ice = taskCard.impact * finalScore * taskCard.ease;
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Internal Sync
      confidenceScore: finalScore, 
      confidence: finalScore,
      iceScore: Math.max(1, Math.min(1000, ice)),
      activityState: "ACTIVE" 
    };
  } else {
    const reasonText = typeof raw.reason === "string" ? raw.reason : JSON.stringify(raw.reason);
    return { 
      processingStatus: "DRAFT", 
      status: "DRAFT", // Internal Sync
      confidenceScore: 1, // Axiom 6/7: Complete Degradation
      confidence: 1,
      impact: 1,
      ease: 1,
      iceScore: 1,
      activityState: "ARCHIVED", // Hide from active lists
      userAnnotation: `[JUDGE REJECTION]: ${reasonText || "Confidence below quality floor."}`
    };
  }
}

module.exports = {
  auditCheckedFlashCard,
  auditCheckedTaskCard
};

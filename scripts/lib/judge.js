/**
 * SOVEREIGN JUDGE
 * v0.11.4-STABLE
 * 
 * The final quality gate of the Trinity Synthesis pipeline.
 * Audits CHECKED cards and determines if they meet the threshold for promotion to VERIFIED.
 * Rejections are demoted to DRAFT with cratered scores to sink in sorting layers.
 */
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, TRINITY_JUDGE_TIMEOUT_MS } = require("./core");
const { getCompanyStrategicContext } = require("./context");
const { getWorkerConfig, calculatePercentile, parseBoundedInt } = require("./shared");
const { unifyObject } = require("./synthesis-utils");

// --- AUDITING ENGINE ---

/**
 * Audits a CHECKED Flashcard and determines its promotion path.
 * Uses a dynamic quality floor based on the percentile distribution of existing scores.
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt, topic = null) {
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
    "APERTUS Purity Principle: You MUST verify that the card is 100% monolingual and strictly uses exactly ONE of the allowed languages. If the card contains mixed languages (e.g., English title with Hungarian body) or any disallowed languages, you MUST REJECT it. Your reasoning and feedback MUST ALSO be in one of the allowed languages.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: TRINITY_JUDGE_TIMEOUT_MS });
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
    console.log(`[JUDGE] [VERIFIED] fc:${flashCard.id} Score: ${finalScore}/${threshold}`);
    return { 
      processingStatus: "VERIFIED", 
      status: "VERIFIED", // Internal Sync
      confidenceScore: finalScore, 
      confidence: finalScore,
      activityState: "ACTIVE" 
    };
  } else {
    const reasonText = typeof raw.reason === "string" ? raw.reason : JSON.stringify(raw.reason);
    console.log(`[JUDGE] [REJECTED] fc:${flashCard.id} Score: ${finalScore}/${threshold} Reason: ${reasonText}`);
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
async function auditCheckedTaskCard(prisma, taskCard, memoryPrompt, topic = null) {
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
    "APERTUS Purity Principle: You MUST verify that the card is 100% monolingual and strictly uses exactly ONE of the languages defined in the [Allowed Languages Policy]. If the card contains mixed languages (e.g., English title with Hungarian body) or any disallowed languages, you MUST REJECT it. Your reasoning and feedback MUST ALSO be in one of the allowed languages.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${taskCard.title}\nDescription: ${taskCard.description}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: TRINITY_JUDGE_TIMEOUT_MS });
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
    console.log(`[JUDGE] [VERIFIED] tc:${taskCard.id} Score: ${finalScore}/${threshold}`);
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
    console.log(`[JUDGE] [REJECTED] tc:${taskCard.id} Score: ${finalScore}/${threshold} Reason: ${reasonText}`);
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

/**
 * checklist WRITER
 * v0.11.4-STABLE
 * 
 * The refinement stage of the local AI pipeline.
 * Upgrades DRAFT cards to CHECKED by improving tone, clarity, and enforcing deduplication.
 */
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, WRITE_STAGE_TIMEOUT_MS } = require("./core");
const { truncate, hashValue, getWorkerConfig, parseBoundedScore, getStageModels, similarity, nextPublicId } = require("./shared");
const { getCompanyStrategicContext } = require("./context");
const { unifyObject } = require("./synthesis-utils");
const { normalizeMarkdownBody, MARKDOWN_CARD_BODY_INSTRUCTION } = require("./markdown");
const {
  buildScoreProfile,
  normalizeGoalScores,
  groundTaskScores,
  persistTaskScoresFromProfile,
} = require("../../src/lib/scoring-contract");
const { computeHistoryAwareTaskSignals } = require("./history-scoring");

// --- UTILITIES ---

/**
 * Normalizes AI-returned body content into a professional string.
 */
function joinBody(body) {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.join("\n\n");
  if (typeof body === "object" && body !== null) {
     return Object.entries(body).map(([k,v]) => `**${k}**: ${v}`).join("\n\n");
  }
  return String(body);
}

// --- REFINEMENT ENGINE ---

/**
 * Refines a DRAFT Flashcard into a CHECKED state.
 */
async function refineDraftFlashCard(prisma, flashCard, memoryPrompt, topic = null, externalContext = null) {
  const bodyLimit = await getWorkerConfig(prisma, flashCard.company || {}, "write_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);
  const company = flashCard.company || null;

  // 1. Internal Memory & De-duplication Check
  // Require BOTH title AND body to be similar to avoid false positives on
  // structured titles like "Summary: CompanyName" which share shape but not substance.
  const existing = await prisma.flashcard.findMany({
    where: { 
      companyId: flashCard.companyId,
      id: { not: flashCard.id },
      processingStatus: { in: ["CHECKED", "VERIFIED"] }
    },
    take: 50
  });

  const duplicate = existing.find(e => 
    similarity(e.title, flashCard.title) > 0.92 && 
    similarity(e.body, flashCard.body) > 0.8
  );
  if (duplicate) {
    console.log(`[WRITER] Duplicate detected: fc:${flashCard.id} matches ${duplicate.publicId} (title sim: ${similarity(duplicate.title, flashCard.title).toFixed(2)}, body sim: ${similarity(duplicate.body, flashCard.body).toFixed(2)})`);
    return { 
      processingStatus: "DECLINED", 
      reviewStatus: "DECLINED", // Legacy Sync
      activityState: "ARCHIVED", // Hide duplicates
      userAnnotation: `[WRITER]: Detected duplicate of #${duplicate.publicId}` 
    };
  }

  const systemPrompt = [
    "You are the checklist WRITER. Your goal is to refine DRAFT FlashCards.",
    "Refine the language, clarify claims, and improve tone.",
    "Strategic context:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nEnsure this refinement supports: ${topic.notes || topic.label}\n` : "",
    "Return a SINGLE JSON object with: title, body, kind, hashtags, confidenceScore.",
    "checklist AXIOM: You MUST generate a decimal confidenceScore on a 1.0 to 10.0 scale with up to one decimal place. NO zeros. NO percentages.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    MARKDOWN_CARD_BODY_INSTRUCTION,
    "STRATEGIC FOCUS: If refining a [SubjectCard], ensure the language reflects the strategy defined in the policy.",
    externalContext ? `### [REFRESH RESEARCH CONTEXT]\n${externalContext}` : "",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${flashCard.title}\nDRAFT Body: ${flashCard.body}`;

  const modelList = await getStageModels(prisma, "WRITE", company);
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: WRITE_STAGE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title || !raw.body) return null;

  let confidence;
  let procStatus = "CHECKED";
  try {
    confidence = parseBoundedScore(raw.confidenceScore, 1, 10);
  } catch (e) {
    // Axiom 2: Human Review Circuit
    confidence = 1;
    procStatus = "REVIEW";
  }

  return {
    title: truncate(raw.title, 160),
    body: truncate(normalizeMarkdownBody(joinBody(raw.body)), bodyLimit),
    kind: String(raw.kind || flashCard.kind).toUpperCase(), 
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : flashCard.hashtags,
    confidenceScore: confidence,
    confidence: confidence,
    processingStatus: procStatus,
    status: "CHECKED", // Internal Sync
    activityState: "ACTIVE"
  };
};

/**
 * Refines a DRAFT Taskcard (NBA) into a CHECKED state.
 */
async function refineDraftTaskCard(prisma, taskCard, memoryPrompt, topic = null, externalContext = null) {
  const descLimit = await getWorkerConfig(prisma, taskCard.company || {}, "write_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);
  const company = taskCard.company || null;

  // De-duplication — require BOTH title AND body to match
  const existing = await prisma.checklistTask.findMany({
    where: { 
      companyId: taskCard.companyId,
      id: { not: taskCard.id },
      processingStatus: { in: ["CHECKED", "VERIFIED", "ACCEPTED"] }
    },
    take: 30
  });

  const tcDuplicate = existing.find(e => 
    similarity(e.title, taskCard.title) > 0.92 && 
    (taskCard.description ? similarity(e.description || "", taskCard.description) > 0.8 : true)
  );
  if (tcDuplicate) {
    console.log(`[WRITER] Duplicate task detected: tc:${taskCard.id} matches ${tcDuplicate.publicId}`);
    return { 
      processingStatus: "DECLINED", 
      status: "DECLINED", // Internal Sync
      activityState: "ARCHIVED", // Hide duplicates
      userAnnotation: `[WRITER]: Duplicate task detected. Matches #${tcDuplicate.publicId}.` 
    };
  }

  const systemPrompt = [
    "You are the checklist WRITER. Refine this DRAFT TaskCard for clarity and impact.",
    "Strategic context:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nAlign this task refinement with the following objective: ${topic.notes || topic.label}\n` : "",
    "Return a SINGLE JSON object with: title, description, kind, impact, confidenceScore, ease.",
    "checklist AXIOM: You MUST generate decimal scores for confidenceScore, impact, and ease on a 1.0 to 10.0 scale with up to one decimal place. NO zeros. NO percentages.",
    "SCORING DISCIPLINE: Score impact, confidence, and ease independently from the actual task. Do not repeat stock score triplets unless the task substance truly matches.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    MARKDOWN_CARD_BODY_INSTRUCTION,
    externalContext ? `### [REFRESH RESEARCH CONTEXT]\n${externalContext}` : "",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${taskCard.title}\nDRAFT Description: ${taskCard.description}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.WRITE, { timeoutMs: WRITE_STAGE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title || !raw.description) return null;

  let confidence, impact, ease, iceScore;
  let procStatus = "CHECKED";
  try {
    confidence = parseBoundedScore(raw.confidenceScore, 1, 10);
    impact = parseBoundedScore(raw.impact, 1, 10);
    ease = parseBoundedScore(raw.ease, 1, 10);
    const historySignals = await computeHistoryAwareTaskSignals(prisma, taskCard.companyId, {
      title: raw.title,
      description: raw.description,
      hashtags: Array.isArray(raw.semanticTags) ? raw.semanticTags.slice(0, 5) : taskCard.hashtags,
    });
    const groundedScores = groundTaskScores({
      impact,
      confidence,
      effort: ease,
      title: raw.title,
      description: raw.description,
      kind: raw.kind || taskCard.kind,
      sourceImpact: taskCard.impact,
      sourceConfidence: taskCard.confidenceScore ?? taskCard.confidence,
      sourceWeight: taskCard.ease,
      sourceIceScore: taskCard.iceScore,
      historyImpact: historySignals.historyImpact,
      historyConfidence: historySignals.historyConfidence,
      historySupport: historySignals.historySupport,
      historyEase: historySignals.historyEase,
      historyDifficulty: historySignals.historyDifficulty,
    });
    const scoreProfile = buildScoreProfile({
      scoreKind: "TASK",
      agent: {
        impact,
        confidence,
        effort: ease,
      },
      calibrated: groundedScores,
      rationale: {
        sourceImpact: taskCard.impact,
        sourceConfidence: taskCard.confidenceScore ?? taskCard.confidence,
        sourceWeight: taskCard.ease,
        sourceIceScore: taskCard.iceScore,
        refinerStage: "writer",
        historyImpact: historySignals.historyImpact,
        historyConfidence: historySignals.historyConfidence,
        historySupport: historySignals.historySupport,
        historyEase: historySignals.historyEase,
        historyDifficulty: historySignals.historyDifficulty,
        historyPositiveMatches: historySignals.positiveMatches,
        historyNegativeMatches: historySignals.negativeMatches,
        historyAverageSimilarity: historySignals.averageSimilarity,
        historyDeliveredMatches: historySignals.deliveredMatches,
        historyAcceptedMatches: historySignals.acceptedMatches,
        historyFrictionMatches: historySignals.frictionMatches,
      },
    });
    const normalizedScores = persistTaskScoresFromProfile(scoreProfile);
    impact = normalizedScores.impact;
    confidence = normalizedScores.confidence;
    ease = normalizedScores.ease;
    iceScore = normalizedScores.iceScore;
    raw._scoreProfile = scoreProfile;
  } catch (e) {
    // Axiom 2: Human Review Circuit
    confidence = 1; impact = 1; ease = 1; iceScore = 1;
    procStatus = "REVIEW";
  }

  // ID Generation
  let publicId = taskCard.publicId;
  if (!publicId) {
    publicId = await nextPublicId(prisma, "checklist");
  }

  return {
    publicId,
    title: truncate(raw.title, 160),
    description: truncate(normalizeMarkdownBody(joinBody(raw.description)), descLimit),
    kind: String(raw.kind || taskCard.kind).toUpperCase(),
    impact,
    confidenceScore: confidence,
    confidence: confidence,
    ease,
    iceScore,
    scoreProfile: raw._scoreProfile || null,
    processingStatus: procStatus,
    status: "CHECKED", // Legacy Sync
    activityState: "ACTIVE"
  };
};

/**
 * Refines an existing Goalcard through the same writer discipline used by
 * knowledge/task maintenance, but keeps the output anchored to a strategic
 * outcome rather than an action item.
 */
async function refineGoalCard(prisma, goalCard, memoryPrompt, topic = null, externalContext = null) {
  const bodyLimit = await getWorkerConfig(prisma, goalCard.company || {}, "write_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, goalCard.companyId);
  const company = goalCard.company || null;

  const systemPrompt = [
    "You are the checklist WRITER. Refine this GoalCard for strategic clarity, precision, and authority.",
    "Keep the output as a desired future outcome or strategic target, not as an execution task.",
    "Strategic context:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nAlign this goal refinement with: ${topic.notes || topic.label}\n` : "",
    "Return a SINGLE JSON object with: title, body, kind, hashtags, confidenceScore, impact, weight.",
    "checklist AXIOM: You MUST generate decimal scores for confidenceScore, impact, and weight on a 1.0 to 10.0 scale with up to one decimal place. NO zeros. NO percentages.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card.",
    MARKDOWN_CARD_BODY_INSTRUCTION,
    externalContext ? `### [REFRESH RESEARCH CONTEXT]\n${externalContext}` : "",
    memoryPrompt,
  ].join("\n");

  const userPrompt = `GOAL Title: ${goalCard.title}\nGOAL Body: ${goalCard.body}`;
  const modelList = await getStageModels(prisma, "WRITE", company);
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: WRITE_STAGE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title || !raw.body) return null;

  let confidence;
  let impact;
  let weight;
  let procStatus = "CHECKED";
  try {
    confidence = parseBoundedScore(raw.confidenceScore, 1, 10);
    impact = parseBoundedScore(raw.impact, 1, 10);
    weight = parseBoundedScore(raw.weight, 1, 10);
  } catch (e) {
    confidence = 1;
    impact = 1;
    weight = 1;
    procStatus = "REVIEW";
  }

  const normalizedScores = normalizeGoalScores({
    confidence,
    confidenceScore: confidence,
    impact,
    weight,
  });

  return {
    title: truncate(raw.title, 160),
    body: truncate(normalizeMarkdownBody(joinBody(raw.body)), bodyLimit),
    kind: String(raw.kind || goalCard.kind || "GOAL").toUpperCase(),
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : goalCard.hashtags,
    confidence: normalizedScores.confidence,
    confidenceScore: normalizedScores.confidenceScore,
    impact: normalizedScores.impact,
    weight: normalizedScores.weight,
    iceScore: normalizedScores.iceScore,
    processingStatus: procStatus,
    activityState: "ACTIVE",
  };
}

module.exports = {
  refineDraftFlashCard,
  refineDraftTaskCard,
  refineGoalCard,
};

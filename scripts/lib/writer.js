/**
 * checklist WRITER
 * v0.11.4-STABLE
 * 
 * The refinement stage of the trinity pipeline.
 * Upgrades DRAFT cards to CHECKED by improving tone, clarity, and enforcing deduplication.
 */
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_WRITE_TIMEOUT_MS } = require("./core");
const { truncate, hashValue, getWorkerConfig, parseBoundedInt, getStageModels, similarity, nextPublicId } = require("./shared");
const { getCompanyStrategicContext } = require("./context");
const { unifyObject } = require("./synthesis-utils");
const { groundTaskScores, normalizeTaskScores } = require("../../src/lib/scoring-contract");

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
async function refineDraftFlashCard(prisma, flashCard, memoryPrompt, topic = null) {
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
    "checklist AXIOM: You MUST generate a strict integer for confidenceScore. The scale is STRICTLY 1 to 10. NO zeros. NO percentages.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    "STRATEGIC FOCUS: If refining a [SubjectCard], ensure the language reflects the strategy defined in the policy.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${flashCard.title}\nDRAFT Body: ${flashCard.body}`;

  const modelList = await getStageModels(prisma, "WRITE", company);
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title || !raw.body) return null;

  let confidence;
  let procStatus = "CHECKED";
  try {
    confidence = parseBoundedInt(raw.confidenceScore, 1, 10);
  } catch (e) {
    // Axiom 2: Human Review Circuit
    confidence = 1;
    procStatus = "REVIEW";
  }

  return {
    title: truncate(raw.title, 160),
    body: truncate(joinBody(raw.body), bodyLimit),
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
async function refineDraftTaskCard(prisma, taskCard, memoryPrompt, topic = null) {
  const descLimit = await getWorkerConfig(prisma, taskCard.company || {}, "write_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);
  const company = taskCard.company || null;

  // De-duplication — require BOTH title AND body to match
  const existing = await prisma.nBAItem.findMany({
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
    "checklist AXIOM: You MUST generate strict integer scores for confidenceScore, impact, and ease. The scale is STRICTLY 1 to 10 (1=Lowest, 10=Highest). NO zeros. NO percentages.",
    "SCORING DISCIPLINE: Score impact, confidence, and ease independently from the actual task. Do not repeat stock score triplets unless the task substance truly matches.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${taskCard.title}\nDRAFT Description: ${taskCard.description}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.WRITE, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title || !raw.description) return null;

  let confidence, impact, ease, iceScore;
  let procStatus = "CHECKED";
  try {
    confidence = parseBoundedInt(raw.confidenceScore, 1, 10);
    impact = parseBoundedInt(raw.impact, 1, 10);
    ease = parseBoundedInt(raw.ease, 1, 10);
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
    });
    const normalizedScores = normalizeTaskScores({
      impact: groundedScores.impact,
      confidence: groundedScores.confidence,
      ease: groundedScores.effort,
    });
    impact = normalizedScores.impact;
    confidence = normalizedScores.confidence;
    ease = normalizedScores.ease;
    iceScore = normalizedScores.iceScore;
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
    description: truncate(joinBody(raw.description), descLimit),
    kind: String(raw.kind || taskCard.kind).toUpperCase(),
    impact,
    confidenceScore: confidence,
    confidence: confidence,
    ease,
    iceScore,
    processingStatus: procStatus,
    status: "CHECKED", // Legacy Sync
    activityState: "ACTIVE"
  };
};

module.exports = {
  refineDraftFlashCard,
  refineDraftTaskCard
};

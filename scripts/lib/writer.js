/**
 * SOVEREIGN WRITER
 * v0.11.4-STABLE
 * 
 * The refinement stage of the Trinity Synthesis pipeline.
 * Upgrades DRAFT cards to CHECKED by improving tone, clarity, and enforcing deduplication.
 */
const { callOllamaJson } = require("./ai");
const { truncate, getWorkerConfig, similarity, clampInt } = require("./shared");
const { getCompanyStrategicContext } = require("./context");

// --- UTILITIES ---

/**
 * Normalizes AI-returned body content into a professional string.
 * 
 * @param {any} body - Raw body content from AI
 * @returns {string} Formatted string
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
 * Implements similarity-based deduplication against the existing knowledge base.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} flashCard - DRAFT flashcard record
 * @param {string} memoryPrompt - Contextual AI memory injection
 * @returns {Promise<object|null>} Refined record data or decline status
 */
async function refineDraftFlashCard(prisma, flashCard, memoryPrompt) {
  const bodyLimit = await getWorkerConfig(prisma, flashCard.company || {}, "write_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  // 1. Internal Memory & De-duplication Check
  const existing = await prisma.flashcard.findMany({
    where: { 
      companyId: flashCard.companyId,
      id: { not: flashCard.id },
      processingStatus: { in: ["CHECKED", "VERIFIED"] }
    },
    take: 50
  });

  const duplicate = existing.find(e => 
    similarity(e.title, flashCard.title) > 0.8 || 
    similarity(e.body, flashCard.body) > 0.8
  );
  if (duplicate) {
    return { 
      processingStatus: "DECLINED", 
      reviewStatus: "DECLINED", // Legacy Sync
      activityState: "ARCHIVED", // Hide duplicates
      userAnnotation: `[WRITER]: Detected duplicate of ${duplicate.publicId}` 
    };
  }

  const systemPrompt = [
    "You are the Checklist WRITER. Your goal is to refine DRAFT FlashCards.",
    "Refine the language, clarify claims, and improve tone.",
    "Strategic context:",
    strategicContext,
    "Return a SINGLE JSON object with: title, body, kind, hashtags, confidenceScore.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${flashCard.title}\nDRAFT Body: ${flashCard.body}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.body) return null;

  return {
    title: truncate(raw.title, 160),
    body: truncate(joinBody(raw.body), bodyLimit),
    kind: String(raw.kind || flashCard.kind).toUpperCase(), 
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : flashCard.hashtags,
    confidenceScore: parseFloat(raw.confidenceScore) || flashCard.confidenceScore || 60,
    processingStatus: "CHECKED",
    status: "CHECKED", // Internal Sync
    activityState: "ACTIVE"
  };
};

/**
 * Refines a DRAFT Taskcard (NBA) into a CHECKED state.
 * Performs ICE scoring and ensures tactical tasks aren't redundant.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} taskCard - DRAFT taskcard record
 * @param {string} memoryPrompt - Contextual AI memory injection
 * @returns {Promise<object|null>} Refined record data or decline status
 */
async function refineDraftTaskCard(prisma, taskCard, memoryPrompt) {
  const descLimit = await getWorkerConfig(prisma, taskCard.company || {}, "write_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);

  // De-duplication
  const existing = await prisma.nBAItem.findMany({
    where: { 
      companyId: taskCard.companyId,
      id: { not: taskCard.id },
      processingStatus: { in: ["CHECKED", "VERIFIED", "ACCEPTED"] }
    },
    take: 30
  });

  if (existing.some(e => similarity(e.title, taskCard.title) > 0.8)) {
    return { 
      processingStatus: "DECLINED", 
      status: "DECLINED", // Internal Sync
      activityState: "ARCHIVED", // Hide duplicates
      userAnnotation: "[WRITER]: Duplicate task detected." 
    };
  }

  const systemPrompt = [
    "You are the Checklist WRITER. Refine this DRAFT TaskCard for clarity and impact.",
    "Strategic context:",
    strategicContext,
    "Return a SINGLE JSON object with: title, description, kind, impact, confidenceScore, ease.",
    "Guidelines:",
    "- Impact: 1-10",
    "- Confidence: 0-100",
    "- Ease: 1-10",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${taskCard.title}\nDRAFT Description: ${taskCard.description}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.description) return null;

  // 1. Scoring Logic (Centralized from Webapp)
  const impact = clampInt(raw.impact || taskCard.impact, 5, 1, 10);
  const confidence = clampInt(raw.confidenceScore || taskCard.confidenceScore, 60, 0, 100);
  const ease = clampInt(raw.ease || taskCard.ease, 5, 1, 10);
  const iceScore = impact * (confidence / 10) * ease;

  // 2. ID Generation (Centralized from Webapp)
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
    ease,
    iceScore,
    processingStatus: "CHECKED",
    status: "CHECKED", // Legacy Sync
    activityState: "ACTIVE"
  };
};

module.exports = {
  refineDraftFlashCard,
  refineDraftTaskCard
};

/**
 * SOVEREIGN SHARED UTILITIES
 * v0.11.3-PRODUCTION
 */
const crypto = require("crypto");
const { callOllamaJson } = require("./ai");
const { truncate, hashValue, nextPublicId, getWorkerConfig } = require("./shared");
const { getCompanyStrategicContext } = require("./context");

/**
 * Handles AI-returned objects/arrays for the 'body' field
 * and converts them into a single professional string.
 */
function joinBody(body) {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) {
    return body.map(item => {
      if (typeof item === "string") return item;
      if (item.text) return `${item.key ? `**${item.key}**: ` : ""}${item.text}`;
      return JSON.stringify(item);
    }).join("\n\n");
  }
  if (typeof body === "object" && body !== null) {
    return Object.entries(body).map(([key, val]) => `**${key}**: ${val}`).join("\n\n");
  }
  return String(body);
}

/**
 * The DRAFTER is the first stage of the Sovereign Synthesis Trinity.
 * It reads raw DataCards (Sources/Files) and proposes initial DRAFT intelligence.
 * Aligned with v0.11.3 standards.
 */
async function draftFlashcardFromDataCard(prisma, company, dataCard, memoryPrompt) {
  const bodyLimit = await getWorkerConfig(prisma, company, "draft_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const { getSkillForSource } = require("./skills");
  const skill = getSkillForSource(dataCard);
  const skillPrompt = skill 
    ? `\n### [SPECIALIZED SKILL ACTIVATED: ${skill.label}]\nYou MUST apply the following marketing framework to this synthesis:\n${skill.framework}\n`
    : "";

  const systemPrompt = [
    "You are the Checklist DRAFTER. Your goal matches DataCards (raw data) to potential FlashCards.",
    "Your synthesis MUST align with the following strategic context of the company:",
    strategicContext,
    skillPrompt,
    "Required fields: title, body, kind, confidence, impact, weight, hashtags.",
    "If the intelligence already exists in the provided context, do NOT duplicate it.",
    "You may propose MULTIPLE FlashCards if the raw data contains distinct insights.",
    "Format: Return a JSON array of objects.",
    "Status will be DRAFT.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nDataCard Context: ${truncate(dataCard.content, 1500)}`;

  const rawArray = await callOllamaJson(systemPrompt, userPrompt);
  if (!Array.isArray(rawArray)) return [];

  const drafts = [];
  for (const raw of rawArray) {
    if (!raw.title || !raw.body) continue;
    const publicId = await nextPublicId(prisma, "Flashcard");
    
    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(raw.title, 160),
      body: truncate(joinBody(raw.body), bodyLimit),
      confidenceScore: parseFloat(raw.confidence) || 50,
      impact: parseInt(raw.impact) || 5,
      weight: parseInt(raw.weight) || 5,
      processingStatus: "DRAFT",
      activityState: "ACTIVE",
      status: "DRAFT", // Internal Sync
      reviewStatus: "PENDING", // Legacy Sync
      kind: String(raw.kind || "SUMMARY").toUpperCase(), 
      hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : [],
      fingerprint: hashValue(`EVO:FC:${company.id}:${dataCard.id}:${raw.title}`),
      createdBy: "drafter-agent",
      // Link info for later
      sourceId: dataCard.id,
      sourceType: "SOURCE"
    });
  }
  return drafts;
}

async function draftTaskcardFromFlashCard(prisma, company, flashCard, memoryPrompt) {
  const descLimit = await getWorkerConfig(prisma, company, "draft_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const systemPrompt = [
    "You are the Checklist DRAFTER. Your goal is to turn FlashCards into actionable TaskCards.",
    "Your tasks MUST be strategically aligned with the company's TopicCards and existing work:",
    strategicContext,
    "Required fields: title, description, kind, impact, confidence, ease.",
    "Check the context carefully. Do NOT draft a task that is already present.",
    "You may propose MULTIPLE TaskCards if appropriate.",
    "Format: Return a JSON array of objects.",
    "Status will be DRAFT.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nFlashCard: ${flashCard.title}\nInsight: ${flashCard.body}`;

  const rawArray = await callOllamaJson(systemPrompt, userPrompt);
  if (!Array.isArray(rawArray)) return [];

  const drafts = [];
  for (const raw of rawArray) {
    if (!raw.title || !raw.description) continue;
    const publicId = await nextPublicId(prisma, "NBAItem");

    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(raw.title, 160),
      description: truncate(joinBody(raw.description), descLimit),
      kind: String(raw.kind || "TASK").toUpperCase(),
      impact: parseInt(raw.impact) || 5,
      confidenceScore: parseFloat(raw.confidence) || 50,
      ease: parseInt(raw.ease) || 5,
      processingStatus: "DRAFT",
      activityState: "ACTIVE",
      status: "DRAFT", // Internal Sync
      createdBy: "drafter-agent",
      fingerprint: hashValue(`EVO:TC:${company.id}:${flashCard.id}:${raw.title}`)
    });
  }
  return drafts;
}

module.exports = {
  draftFlashcardFromDataCard,
  draftTaskcardFromFlashCard
};
